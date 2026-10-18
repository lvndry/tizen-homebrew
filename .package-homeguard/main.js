// PROBE5 — diagnostic + foreground handoff, isolated and fully logged on screen.
(function () {
    'use strict';
    var log = document.getElementById('log');
    function note(t) {
        log.textContent = (log.textContent ? log.textContent + '\n' : '') + t;
        log.scrollTop = log.scrollHeight;
        try {
            fetch('http://127.0.0.1:8091/dev/hglog', {
                method: 'POST',
                headers: { 'x-homebrew-pin': '000000', 'Content-Type': 'text/plain' },
                body: JSON.stringify({ from: 'probe5', text: t }),
            }).catch(function (e) { fetchErr = (fetchErr || '') + 'FETCHERR ' + e + '; '; });
        } catch (e) {}
    }
    var fetchErr = '';

    note('PROBE5 diagnostic');
    note('launch: ' + typeof tizen.application.launch);
    note('getCurrentApplication: ' + typeof tizen.application.getCurrentApplication);

    var app = null;
    try {
        app = tizen.application.getCurrentApplication();
        note('app: ' + typeof app);
        if (app && typeof app === 'object') {
            note('app proto: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(app)).join(','));
            note('app.background: ' + typeof app.background);
            note('app.close: ' + typeof app.close);
            note('app.terminate: ' + typeof app.terminate);
        }
    } catch (e) { note('getCurApp THROW: ' + e.message); }

    setTimeout(function () {
        try {
            tizen.application.launch('BonsoirTV1.Bonsoir');
            note('t=3s launch: NO THROW');
        } catch (e) { note('t=3s launch THROW: ' + e.message); }
    }, 3000);

    setTimeout(function () {
        try {
            if (app && typeof app.background === 'function') { app.background(); note('t=4.5s backgrounded via app.background'); }
            else if (app && typeof app.close === 'function') { app.close(); note('t=4.5s CLOSED via app.close'); }
            else { note('t=4.5s no background/close available'); }
        } catch (e) { note('t=4.5s hide THROW: ' + e.message); }
    }, 4500);

    note('--- after ~5s: is Bonsoir on your screen? ---');
    setTimeout(function () { note('fetchErr: ' + (fetchErr || 'NONE — fetch channel works')); }, 9000);
}());
