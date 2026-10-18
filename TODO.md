# TODO

The working list for the fork. Checked items are done; the commit is in the
history. Open items are ordered by the value they give to a person actually
running the service, not by the order they were thought of.

## Ours

- [x] `/restart` and self-update self-heal without a manual nudge — an uncaught
  throw trips auto-restart; a bare non-zero exit was flaky on CU7105
  (`7d71b45`, `1ba7b65`)
- [x] `restart.js` one-command nudge in samsung-tv-toolbox for the two cases
  the TV cannot revive itself (cold boot, self-update)
- [x] UI restyled in the Bonsoir language; the aquarium deleted (`1391f34`)
- [x] Homeguard module, app and packager removed — the experiment was closed,
  not shelved (`06b31e5`, `87a5288`)
- [x] `main.js` split into per-concern route modules (`1ba7b65`)
- [ ] **Invisible relaunch.** The Control API nudge launches the app, which
  foregrounds it and yanks the TV off whatever input it was showing. Probed:
  the Control API has no service entry (`GJBBYNLkgP.TizenHomebrewService`
  404s — only the app bundle is reachable), but the app can run while
  `visible: false`. So the fix is for the app to background itself the moment
  it is launched by the API rather than by the remote; needs a launch source
  the Tizen app API exposes, verified on the set. (2026-10-18)
- [x] **sdb `shell:` empty output — answered: it is the allowlist.** sdbd
  executes only a fixed verb set, and most of it prints nothing: `getduid`
  answers, `vd_applaunch`/`vd_appstop`/`vd_appinstall` execute silently, and
  `echo`, `ifconfig`, `ps`, `ls`, `cat`, `dmesg`, `netstat`, `df`, `pkgcmd -l`
  all come back empty (CU7105, 2026-10-18). There is no general shell behind
  `shell:0`; the empty string means the verb is not on the allowlist, not a
  capture failure. Anything that needs real output has to read the filesystem
  from the service's own `fs`, not ask sdbd.
- [ ] **Off-LAN.** Reach the service from outside the TV's network. The
  personal-tailnet hop works; document it as the way or find something that
  does not need a relay.

## Upstream, carried over

- [x] PIN reload/reset on entry
- [x] Back / exit stops the process (music no longer plays on the home screen)
- [x] Restart-process button
- [x] Package signing opt-in instead of opt-out
- [x] Renamed `tizenhomebrew.wgt` references to `homebrew.wgt`
- [x] List packages by enumerating `/opt/usr/apps` instead of
  `getPackagesInfo`, which blocks the JS thread for about five minutes on
  Tizen 9 (`service/src/tv/packages.js` reads the directory; `getAppsInfo` is
  asked only for names and versions, under a 4s deadline, with a manifest
  fallback)
- [x] Document that package removal needs `packagemanager.install` and a
  platform certificate the Samsung endpoint cannot issue
  (`service/src/tv/packages.js` header)
- [ ] Rewrite the `tizen` dependency for better reliability and to unlock more
  capabilities
- [ ] Build a partner privilege test matrix: one disposable widget per
  candidate privilege, recording install acceptance, api exposure, call result
  and reboot persistence, and only promote a privilege into the homebrew
  manifest after it passes
- [ ] Check whether `productinfo`, `network.public`, `sso.partner`, `mde` and
  `edge` privileges are accepted for a partner signed third party widget
- [ ] Probe the `wrt.tv` and `wrt.mde` bindings one at a time in a disposable
  test package to find which are permission gated
- [ ] Inventory `webapis.*` from a running widget page, since the node service
  scope never gets it injected
- [x] Test whether sdb `vd_appuninstall` removes developer installed widgets —
  it does, for everything a user can uninstall; the 28 protected Samsung
  packages refuse it (CU7105, the bloatware pass)
- [ ] System dashboard: memory, uptime, platform, model, firmware, network
  state, free space, sdb availability and certificate coverage
- [ ] App library: package inventory with versions, user app filtering,
  manifest and privilege inspection, launching through app control
- [ ] Media and storage tools: browse `/home/owner/content` and `/media`,
  extract archives in the app workspace, checksums, downloads through
  `tizen.download`
- [ ] Diagnostics report: declared privileges, listening sockets, service logs
  and a public/partner compatibility check
- [ ] Keep `/home/owner/share`, accounts, sso, remote input injection and web
  history out of feature work
