// Service entry point. Tizen calls onStart when the service boots (and
// onRequest when something launches into an already-running one); a desktop
// run with no `tizen` object starts directly, so the same code serves as the
// development harness.
//
// This file is the composition root: it builds the long-lived collaborators
// (log, store, catalog, installer, relay, device probe, repl), hands them to
// the route modules and the socket layer, and opens the HTTP server. The
// HTTP surface itself lives in routes/*, one file per concern:
//
//   routes/status.js     read-only facts, split by who is asking
//   routes/install.js    the mutating surface — installs and certificates
//   routes/lifecycle.js  /restart and /shutdown
//   routes/dev.js        the PIN-gated developer endpoints (dev builds only)
//   routes/ui.js         the catch-all that serves the bundled UI pages
//
// The catch-all is registered last, after every other route.

'use strict';

const { createServer } = require('http');
const { join } = require('path');
const { took } = require('./obs/units.js');
const { homedir } = require('os');

const { startRecording, Facility } = require('./obs/log.js');
const runtime = require('./obs/runtime.js');
const platform = require('./obs/platform.js');
const memory = require('./obs/memory.js');

const recorded = startRecording();
const log = recorded.log;

const { createStore } = require('./state.js');
const { createRouter } = require('./http/router.js');
const pin = require('./auth/pin.js');
const device = require('./tv/device.js');
const sdb = require('./tv/sdb.js');
const packages = require('./tv/packages.js');
const { Relay } = require('./tv/relay.js');
const config = require('./config.js');
const protocol = require('./protocol.js');
const { createInstaller } = require('./install/pipeline.js');
const { createCatalog } = require('./install/catalog.js');
const { createUpdates } = require('./install/updates.js');

const status = require('./routes/status.js');
const install = require('./routes/install.js');
const lifecycle = require('./routes/lifecycle.js');
const dev = require('./routes/dev.js');
const ui = require('./routes/ui.js');

const { ErrorCode } = protocol;

// 8080 is taken by a Samsung system service, so binding there fails with EADDRINUSE.
const PORT = Number(process.env.HOMEBREW_PORT) || 8091;

const BUILD = '__HOMEBREW_BUILD__';
const ORIGIN = '__HOMEBREW_ORIGIN__';

const DEVELOPER = globalThis.__HOMEBREW_DEV__ === true;

// Boot marker: every time this service process starts, append a timestamp.
// Lets us distinguish an on-boot start from a manual relaunch after a power
// cycle (compare against /proc/uptime from the TV itself).
try {
    const bootLog = '/home/owner/share/tmp/sdk_tools/bootlog.txt';
    require('fs').appendFileSync(bootLog, `start ${new Date().toISOString()} pid=${process.pid}\n`);
} catch (e) {}

const start = () => {
    const startedAt = new Date().toISOString();
    const secret = DEVELOPER ? pin.DEVELOPER_PIN : config.pairingPin();

    const svc = log.on(Facility.SVC);

    svc.info(`tizen homebrew ${BUILD} starting`);
    svc.info(`${runtime.summary()}, pid ${process.pid}`);

    const devLog = log.on(Facility.DEV);

    platform.describe().then(
        (facts) => platform.summary(facts).forEach((line) => devLog.info(line)),
        (error) => devLog.warn(`could not read the platform: ${error.message}`)
    );

    if (DEVELOPER) {
        log.on(Facility.AUTH).warn(`DEVELOPER BUILD — pin fixed at ${secret}, and POST /dev/eval will run ` +
            'anything this network sends it. Do not leave this on a television you care about.');
    } else {
        log.on(Facility.AUTH).info(`pairing pin ${secret} — kept across restarts, so a reboot does not ` +
            'unpair every phone');
    }

    const adopted = config.adoptHandoff();

    if (adopted) {
        log.on(Facility.CFG).ok(`certificates adopted from bootstrap for ${adopted.join(', ') || 'an unnamed device'}`);
    } else if (config.hasLegacyCertificates()) {
        log.on(Facility.CFG).warn('the stored certificates are in the old .p12 format and cannot be used — ' +
            'run `npm run certs` again');
    }

    const store = createStore({
        installing: false,
        catalog: [],
        catalogStale: false,
        lockout: pin.fresh(),
        device: null
    });

    const stored = config.read().catalogUrl;
    const catalogUrl = stored || `${ORIGIN}/catalog.json`;
    const catalogCache = join(homedir(), 'share', 'homebrewCatalog.json');

    const catalog = createCatalog({ url: catalogUrl, cachePath: catalogCache, log });

    // No prime() at startup: priming getPackagesInfo wedges the service on Tizen 9.0.
    const updates = createUpdates({ packages, log, config });

    log.on(Facility.CAT).info(`origin ${catalogUrl}${stored ? ' (from the stored configuration)' : ''}`);
    log.on(Facility.CFG).info(`cache ${catalogCache}`);

    const relay = new Relay({
        enabled: config.read().relayEnabled,
        packageId: device.onTv ? tizen.application.getAppInfo().packageId : null,
        log: (message) => log.on(Facility.RELAY).info(message)
    });

    if (relay.enabled) log.on(Facility.RELAY).warn('the command relay is ON from stored configuration');

    // Loaded on first use so a television that never installs anything does not parse node-forge.
    const resigner = async () => {
        const { resign } = require('./install/resign.js');

        return (archive) => resign(archive, config.read());
    };

    const installer = createInstaller({ sdb, device, config, resigner, store, log });

    const announce = (state, previous) => {
        if (!previous) {
            devLog.info(state.onTv
                ? `tizen ${state.platformVersion || 'unknown'}` +
                  `${state.needsResign ? ' — packages must be re-signed for this firmware' : ''}`
                : 'not running on a television — this is a development harness');

            if (state.onTv && state.developerMode === false) devLog.warn('developer mode is off');
        } else if (previous.ready === state.ready) {
            return state;
        }

        if (state.ready) {
            log.on(Facility.SDB).ok(`loopback 127.0.0.1:${sdb.SDB_PORT} answered — this TV can install its own apps`);
        } else if (state.onTv) {
            log.on(Facility.SDB).warn(state.sdbDetail
                ? `loopback 127.0.0.1:${sdb.SDB_PORT} — ${state.sdbDetail}`
                : `loopback 127.0.0.1:${sdb.SDB_PORT} is not usable (${state.sdbError || state.reason || 'unknown'})`);

            devLog.info(state.reason === 'debugModeOff'
                ? 'if it stays this way: Developer Mode in Apps › 12345 › Settings, then restart the TV'
                : 'if it stays this way: Host PC IP = 127.0.0.1 in Apps › 12345 › Settings, then restart ' +
                  'the TV — sdbd reads that value only at startup');
        }

        return state;
    };

    // Filled in once the socket server is up, at the end of this function. The sweep below is the
    // only thing that learns something without being asked, so it is the only thing that pushes.
    let sockets = null;

    const refreshDevice = async () => {
        // An install has the connection; probing across it would only add commands to what sdbd is doing.
        if (store.select('installing')) return store.select('device');

        const previous = store.select('device');
        const first = await device.probe();

        // sdbd drops the occasional connection, so a demotion is confirmed by a second probe.
        const state = previous && previous.ready && !first.ready
            ? await device.probe()
            : first;

        store.update({ device: state });

        // Compared whole: `ready` alone would hold back a changed reason for the same unreadiness.
        if (sockets && JSON.stringify(previous) !== JSON.stringify(state)) {
            sockets.broadcast(protocol.Outbound.STATE, { ...state, hasCertificates: config.hasCertificates() });
        }

        return announce(state, previous);
    };

    refreshDevice();
    if (device.onTv) setInterval(refreshDevice, 15000);

    const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    const fromLoopback = (request) =>
        LOOPBACK.indexOf((request.socket && request.socket.remoteAddress) || '') !== -1;

    const authorise = (presented) => {
        const lockout = store.select('lockout');

        if (pin.isLocked(lockout)) {
            const seconds = Math.ceil(pin.remaining(lockout) / 1000);
            return { ok: false, code: ErrorCode.LOCKED_OUT, message: `Too many incorrect PINs. Try again in ${seconds}s.` };
        }

        if (!pin.matches(presented, secret)) {
            store.update({ lockout: pin.recordFailure(lockout) });
            return { ok: false, code: ErrorCode.UNAUTHORIZED, message: 'Wrong or missing PIN.' };
        }

        store.update({ lockout: pin.recordSuccess() });
        return { ok: true };
    };

    const ctx = {
        build: BUILD,
        port: PORT,
        startedAt,
        runtime,
        device,
        packages,
        store,
        config,
        log,
        secret,
        sdb,
        svc,
        net: log.on(Facility.NET),
        recorded,
        installer,
        updates,
        relay,
        catalog,
        protocol,
        fromLoopback,
        authorise
    };

    const router = createRouter({
        log,
        quiet: (request, path) =>
            request.method === 'GET' && fromLoopback(request) &&
            ['/logs', '/state', '/pin', '/version', '/health'].indexOf(path) !== -1
    });

    status.register(ctx, router);
    install.register(ctx, router);
    lifecycle.register(ctx, router);

    if (DEVELOPER) {
        const { createRepl } = require('./dev/repl.js');

        const repl = createRepl({
            require, process, log, store, config, secret,
            catalog, updates, installer, relay, device, sdb, packages, platform, runtime, memory
        });

        svc.warn(`repl: POST /dev/eval, with ${repl.names.join(' ')} in scope`);
        dev.register({ ...ctx, repl }, router);
    }

    // The catch-all must come after every other route.
    ui.register(ctx, router);

    const server = createServer(router.listener);

    // A failed bind arrives as an event, so without this nothing listens and nothing says so.
    server.on('error', (error) => {
        ctx.net.err(`cannot listen on ${PORT}: ${error.message}`);

        if (error.code === 'EADDRINUSE') {
            ctx.net.err('another app or a system service has claimed that port — nothing will answer');
        }
    });

    server.listen(PORT, '0.0.0.0', () => {
        ctx.net.ok(`listening on 0.0.0.0:${PORT}`);

        const addresses = ctx.lanAddresses();

        if (addresses.length === 0) {
            ctx.net.warn('no LAN address — this TV is not on a network, so no phone can reach it');
        }

        addresses.forEach((entry, index) => ctx.net.info(
            `${index === 0 ? 'reachable at' : 'also at'} http://${entry.address}:${PORT} (${entry.iface})`));

        svc.ok(`startup finished in ${took(recorded.uptime())}`);
    });

    sockets = require('./socket.js').attach({
        server, store, secret, authorise, installer, catalog, updates, relay, refreshDevice,
        fromLoopback, greeting: () => ({ ...ctx.pairing(), build: BUILD }), recorded, config, protocol, log
    });

    return { server, port: PORT, pin: secret, build: BUILD };
};

// Tizen's service runtime calls onStart; a service exporting anything else loads and never listens.
module.exports.onStart = start;
module.exports.start = start;

// Tizen calls onRequest for launches into a running service; without it the runner throws on each one.
module.exports.onRequest = () => log.on(Facility.SVC).debug('a launch reached a service that is already running');
module.exports.BUILD = BUILD;
module.exports.PORT = PORT;

if (!device.onTv) start();
