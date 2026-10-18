# TODO

Closed 2026-10-18. Everything on the list is done, dropped by decision, or
waiting on hardware that is not bought yet (off-LAN, Pi). Kept as the closed
record of the fork's working list.

## Ours

- [x] `/restart` and self-update self-heal without a manual nudge — an uncaught
  throw trips auto-restart; a bare non-zero exit was flaky on CU7105
  (`7d71b45`, `1ba7b65`)
- [x] `restart.js` one-command nudge in samsung-tv-toolbox for the two cases
  the TV cannot revive itself (cold boot, self-update)
- [x] UI restyled in the Bonsoir language; the aquarium deleted (`1391f34`)
- [x] Homeguard module, app and packager removed — the experiment was closed,
  not shelved (`06b31e5`, `87a5288`)
- [x] `main.js` split into per-concern route modules, then TypeScripted
  (`1ba7b65`, `438a9a2`, `2dfe5ba`)
- [x] **Invisible relaunch** — the web runtime exposes no launch parameters, so
  the page decides for itself: after it has paired, a short wait, and if no
  one has touched the remote it calls `application.hide()` and leaves the
  screen (the nudge lands on the launcher; deploys are timed to quiet
  moments). Verified on the set (`65877bf`).
- [x] **sdb `shell:` empty output — answered: it is the allowlist.** sdbd
  executes only a fixed verb set, and most of it prints nothing: `getduid`
  answers, `vd_applaunch`/`vd_appstop`/`vd_appinstall` execute silently, and
  `echo`, `ifconfig`, `ps`, `ls`, `cat`, `dmesg`, `netstat`, `df`, `pkgcmd -l`
  all come back empty (CU7105, 2026-10-18). There is no general shell behind
  `shell:0`; the empty string means the verb is not on the allowlist, not a
  capture failure. Anything that needs real output has to read the filesystem
  from the service's own `fs`, not ask sdbd.
- [~] **Off-LAN** — waiting on the Pi (reminder, 2026-11-15). The personal
  tailnet hop is the relay; nothing to build until the box exists.

## Upstream, carried over

- [x] PIN reload/reset on entry
- [x] Back / exit stops the process (music no longer plays on the home screen)
- [x] Restart-process button
- [x] Package signing opt-in instead of opt-out
- [x] Renamed `tizenhomebrew.wgt` references to `homebrew.wgt`
- [x] List packages by enumerating `/opt/usr/apps` instead of
  `getPackagesInfo`, which blocks the JS thread for about five minutes on
  Tizen 9 (`service/src/tv/packages.ts` reads the directory; `getAppsInfo` is
  asked only for names and versions, under a 4s deadline, with a manifest
  fallback)
- [x] Document that package removal needs `packagemanager.install` and a
  platform certificate the Samsung endpoint cannot issue
  (`service/src/tv/packages.ts` header)
- [~] Rewrite the `tizen` dependency — deferred. The surface it covers is
  small and stable; revisit only when a feature actually needs the platform
  APIs.
- [x] **Partner privilege matrix — researched, the answer is "the manifest is
  already right".** `productinfo` and `network.public` are public-level and
  pointlessly declared (we cover both without the privilege); `sso.partner`
  is the partner certificate's actual purpose but only pays if a Samsung
  Account flow is built; `mde`, `edge`, `network.server` and
  `application.backgroundquery` are undocumented — no hit anywhere in Tizen
  docs, SSSP/B2B-era names that do not appear to exist on consumer Tizen 6.
  Rule going forward: add a privilege only when the JavaScript calls the API
  it guards (`2026-10-18`).
- [x] **`wrt.tv` / `wrt.mde` bindings — probed from a running service on the
  set.** Neither is present in the service webview realm (`wrt_tv`, `wrt_mde`,
  `tizen.tv`, `tizen.media`, `tizen.audio`, `tizen.file` all undefined);
  `tizen.download` and `tizen.systeminfo` are. The media bindings live in the
  app webview and/or need a privilege we do not hold, so no TV-media feature
  is built off the service (`2026-10-18`).
- [x] **`webapis.*` inventory — probed.** `window.webapis` and the `ssoGuid`
  global exist in the webview realm, confirming the injection the service
  scope misses; the inventory is the one above (`2026-10-18`).
- [x] Test whether sdb `vd_appuninstall` removes developer installed widgets
  — it does, **and it does for most Samsung packages too**: the verb answers
  empty for every result (allowlist quirk), so the 2026-10-18 bloatware pass
  had to be verified against the filesystem. 47 Samsung services (alexa,
  buds, wifi-motion, iot, context-aware, the coba home plugins, the game
  stack, bixby, search, samsung-account, billing…) uninstalled cleanly, none
  load-bearing, service healthy afterwards (`2026-10-18`).
- [~] System dashboard — dropped (2026-10-18, "not sure I need them"). The
  raw facts are one `/dev/eval` away whenever they are wanted.
- [~] App library — dropped, same decision. `/packages` + the filesystem
  probe cover it.
- [~] Media and storage tools — dropped, same decision. `/home/owner/content`
  and `/media` are browsable from the service whenever it matters.
- [~] Diagnostics report — dropped, same decision.
- [x] Keep `/home/owner/share`, accounts, sso, remote input injection and web
  history out of feature work — held.
