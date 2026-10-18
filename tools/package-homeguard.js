'use strict';

// Package homeguard/ into release/homeguard.wgt, signed with the same
// author + distributor certificates as the main build.

const { execFileSync } = require('child_process');
const { mkdirSync, rmSync, cpSync, statSync } = require('fs');
const { join } = require('path');

const { ROOT } = require('./config.js');
const { which, runSync } = require('./which.js');
const certificates = require('./certificates.js');

const source = join(ROOT, 'homeguard');
const out = join(ROOT, 'release', 'homeguard.wgt');
const staging = join(ROOT, '.package-homeguard');

const tizenjs = which('tizenjs');
const found = certificates.locate();
const absent = certificates.missing(found);
if (absent.length) {
    console.error(`Missing certificates:\n  ${absent.join('\n')}`);
    process.exit(1);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(source, staging, { recursive: true });

try {
    runSync(tizenjs, [
        'build', '.',
        '-t', 'wgt',
        '-o', out,
        '--author', found.author,
        '--authorPwd', found.password,
        '--distributor', found.distributor,
        '--distributorPwd', found.distributorPassword,
    ], { cwd: staging, stdio: 'pipe', encoding: 'utf8' });
} catch (e) {
    console.error(`${e.stdout || ''}${e.stderr || ''}`.trim());
    process.exit(1);
}

console.log(`release/homeguard.wgt  ${statSync(out).size} bytes`);
