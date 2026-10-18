// PROBE6 — reachability diagnostic. Shows whether the app can reach :8091
// (the dev service) via GET and POST. Everything on screen, big white text.
(function () {
    'use strict';
    var log = document.getElementById('log');
    function note(t) {
        log.textContent = (log.textContent ? log.textContent + '\n' : '') + t;
        log.scrollTop = log.scrollHeight;
    }
    note('PROBE6 — testing my own network reach');

    // 1) Can I GET :8091 at all?
    fetch('http://127.0.0.1:8091/version', { headers: { 'x-homebrew-pin': '000000' } })
        .then(function (r) { return r.text().then(function (t) { note('8091 GET version => ' + r.status + ' ' + t.slice(0, 40)); }); })
        .catch(function (e) { note('8091 GET FAIL => ' + e); });

    // 2) Can I POST :8091/dev/hglog?
    fetch('http://127.0.0.1:8091/dev/hglog', {
        method: 'POST',
        headers: { 'x-homebrew-pin': '000000', 'Content-Type': 'text/plain' },
        body: 'reach-test-from-app',
    })
        .then(function (r) { return r.text().then(function (t) { note('8091 POST hglog => ' + r.status + ' ' + t.slice(0, 40)); }); })
        .catch(function (e) { note('8091 POST FAIL => ' + e); });

    // 3) Control for comparison — GET :8001 (known to work)
    fetch('http://127.0.0.1:8001/api/v2/applications/BonsoirTV1.Bonsoir')
        .then(function (r) { return r.text().then(function (t) { note('8001 GET => ' + r.status + ' ' + t.slice(0, 60)); }); })
        .catch(function (e) { note('8001 GET FAIL => ' + e); });

    note('--- read the three "=>" lines above ---');
}());
