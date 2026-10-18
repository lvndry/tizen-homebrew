// Homeguard: makes Bonsoir the TV's de-facto home, fully on-TV.
//
// The HOME key belongs to the system — pressing it drops you on the launcher
// first and no app can rebind it. But "Bonsoir is no longer on screen" is
// observable, and launching an app to the front works through the TV's own
// Control API when the caller is a paired device. So this module, living in
// the Homebrew service (already on the TV), pairs once with the Control API
// (loopback, its own identity), then:
//
//   - every 2.5 s asks "is Bonsoir visible?" (tokenless read),
//   - on the visible → hidden edge (the user just pressed HOME, or left
//     Bonsoir some other way) relaunches Bonsoir to the front,
//   - while `suppress` is set (Bonsoir's rack opened another app, or the
//     user tapped "Tizen OS") it stays out of the way; the flag clears the
//     moment Bonsoir is visible again.
//
// Guard rules: 20 s rest after service start, 5 s rest between launches.
// A relaunch while Bonsoir is already up is a harmless no-op, so a flaky
// `visible` flag cannot cause launch storms.
'use strict';

const fs = require('fs');
const WebSocket = require('ws');

const HOME_APP = 'BonsoirTV1.Bonsoir';
const POLL_MS = 2500;
const LAUNCH_REST_MS = 5000;
const BOOT_GRACE_MS = 20000;
const CONTROL = 'http://127.0.0.1:8001';
const CHANNEL = 'wss://192.168.1.119:8002/api/v2/channels/samsung.remote.control?name=U2Ftc3VuZ1JlbW90ZUFwcA==';
const TOKEN_FILE = '/home/owner/share/tmp/sdk_tools/control-token.txt';

const state = {
    enabled: false,
    suppress: false,
    homeApp: HOME_APP,
    bonsoirVisible: null,
    token: null,
    pairingPin: null, // set while the TV is showing a pairing PIN
    launched: 0,
    errors: 0,
    lastError: null,
    since: new Date().toISOString(),
    dbg: [],
};

function dbg(text) {
    state.dbg.push(`${new Date().toISOString().slice(11, 19)} ${text}`.slice(0, 200));
    if (state.dbg.length > 12) state.dbg.shift();
}

const startedAt = Date.now();

function note(error) {
    state.lastError = String(error);
    state.errors++;
}

function saveToken() {
    if (!state.token) return;
    try { fs.writeFileSync(TOKEN_FILE, state.token); } catch (e) {}
}

function loadToken() {
    try {
        const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
        if (token) state.token = token;
    } catch (e) {}
}

function appState(appId) {
    return fetch(`${CONTROL}/api/v2/applications/${appId}`)
        .then((response) => response.json())
        .catch(() => null);
}

function launch(appId) {
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    return fetch(`${CONTROL}/api/v2/applications/${appId}`, { method: 'POST', headers })
        .then((response) => response.status);
}

// One Control API channel, kept open while a pairing PIN is expected.
let channel = null;
let channelWaiting = false;

function onChannelMessage(raw) {
    dbg('MSG ' + raw.slice(0, 160));
    let message;
    try { message = JSON.parse(raw); } catch (e) { return; }
    if (message.token) {
        state.token = message.token;
        state.pairingPin = null;
        state.lastError = null;
        channelWaiting = false;
        saveToken();
        return;
    }
    if (message.event === 'pairing' && message.result === 'SUC' && typeof message.data === 'string') {
        state.pairingPin = message.data;
        channelWaiting = true;
    }
}

function openChannel() {
    if (channel) return;
    const ws = new WebSocket(CHANNEL, { rejectUnauthorized: false });
    channel = ws;
    let handshakeDone = false;
    ws.on('open', () => dbg('OPEN'));
    ws.on('message', (data) => {
        const text = data.toString();
        // Mirror the proven pair.js handshake: the FIRST message either
        // already carries a token (identity already paired) or is a
        // pairing challenge. Only after seeing it do we ask for the PIN.
        if (!handshakeDone) {
            handshakeDone = true;
            onChannelMessage(text);
            if (!state.token) {
                ws.send(JSON.stringify({ event: 'req', id: 'pairing', data: 'pairing' }));
                dbg('SENT pairing-req');
            }
            return;
        }
        onChannelMessage(text);
    });
    ws.on('error', (e) => { dbg('ERR ' + e.message); note('channel ' + e.message); });
    ws.on('close', (code, reason) => {
        dbg('CLOSE ' + code + ' ' + (reason || ''));
        channel = null;
        channelWaiting = false;
        if (state.enabled && !state.token) setTimeout(openChannel, 3000);
    });
    ws.on('open', () => {});
}

function pair(pin) {
    openChannel();
    if (channel && channel.readyState === 1) {
        channel.send(JSON.stringify({ event: 'req', id: 'pairing', data: pin }));
        return { ok: true, sent: pin };
    }
    return { ok: false, error: 'channel not open' };
}

function tick() {
    if (!state.enabled) return;
    appState(state.homeApp).then((info) => {
        if (!info) {
            note('no appState');
            return;
        }
        if (!state.token) openChannel();
        state.bonsoirVisible = Boolean(info.visible);
        if (state.bonsoirVisible) state.suppress = false;

        const now = Date.now();
        if (
            state.enabled &&
            state.token &&
            !state.suppress &&
            !state.bonsoirVisible &&
            now - startedAt > BOOT_GRACE_MS &&
            now - state.lastLaunch > LAUNCH_REST_MS
        ) {
            state.lastLaunch = now;
            launch(state.homeApp).then((status) => {
                if (status >= 400) note('launch HTTP ' + status);
                else state.launched++;
            });
        }
    });
}

module.exports = {
    start() {
        // Expose the working (bundled) WebSocket + state to /dev/eval so
        // the pairing handshake can be driven and observed interactively.
        globalThis.__ws = WebSocket;
        globalThis.__homeguardState = state;
        loadToken();
        if (state.enabled && !state.token) openChannel();
        setInterval(tick, POLL_MS);
        setTimeout(tick, 1000);
    },
    status() {
        return {
            ok: true,
            enabled: state.enabled,
            suppress: state.suppress,
            homeApp: state.homeApp,
            bonsoirVisible: state.bonsoirVisible,
            tokenPresent: Boolean(state.token),
            pairingPin: state.pairingPin,
            launched: state.launched,
            errors: state.errors,
            lastError: state.lastError || null,
            since: state.since,
            dbg: state.dbg,
        };
    },
    // POST /dev/homeguard accepts { enabled?: boolean, suppress?: boolean, pin?: string }.
    patch(patch) {
        if (patch.pin) {
            const result = pair(String(patch.pin));
            return { ok: result.ok, sent: result.sent || null, error: result.error || null, ...this.status() };
        }
        if (patch.enabled === undefined && patch.suppress === undefined) return this.status();
        if (patch.enabled !== undefined) state.enabled = Boolean(patch.enabled);
        if (patch.suppress !== undefined) state.suppress = Boolean(patch.suppress);
        return this.status();
    },
};
