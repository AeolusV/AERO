# Developing AERO

[简体中文](DEVELOPMENT.md) · **English**

[Product overview](../README.en.md) · [User guide](USAGE.en.md)

This project is source available with author authorization required. Check the applicable scope in [LICENSE](../LICENSE) before development, modification or distribution. See [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md) for third-party content.

## Development entry

On Windows with Node.js 24 LTS, run from the repository root:

```powershell
npm.cmd ci
npm.cmd run runtime:electron
npm.cmd run dev
```

This starts local Vite and Electron on `127.0.0.1:5173`. AERO is single-instance. If it is already running, explicitly exit from the tray before starting a development instance; otherwise you may only see the existing window.

The legacy package name `codex-micro-bar` and existing storage keys are retained to preserve user settings. The product name is AERO. Do not rename those identifiers solely for branding consistency.

## Code map

| Entry | Responsibility |
| --- | --- |
| `electron/main.cjs` | Windows, tray, lifecycle and IPC |
| `electron/startup.cjs` | Production build and development service launch-target checks |
| `electron/preload.cjs` | Isolated renderer interfaces |
| `electron/codex-bridge.cjs` | Codex app-server, task status and actions |
| `electron/window-spring.cjs` | Window position and motion calculations |
| `electron/wake-listener-manager.cjs` | Listener processes, devices, configuration and logs |
| `electron/wake-runtime-installer.cjs` | Local runtime setup |
| `src/App.tsx` / `src/styles.css` | Bars, settings, themes and animation |
| `src/WakeSettings.tsx` | Local voice settings |
| `wake/wake_listener.py` | Offline recognition, microphone release and hotkey handoff |
| `scripts/` | Regression tests, diagnostics and asset tools |

## Verification

```powershell
npm.cmd test          # Offline regressions; no real Codex or microphone access
npm.cmd run check     # Type checks for both TypeScript configurations
npm.cmd run build     # Tray assets, type checks and production build
npm.cmd run verify    # Tests + production build
```

The default suite uses an explicit allowlist covering startup, bridge actions, effort compatibility, control ordering, names, task status, light colors and motion logic. Some tests check source constraints; they are not real-machine interaction or full end-to-end validation. A failed or timed-out subtest makes the overall command return a nonzero status.

`test:wake-manager`, `test:wake-live`, `test:wake-ui`, `test:wake-runtime` and `scripts/*smoke.cjs` are additional diagnostics, not part of the default suite. They may depend on local models, real devices, Codex or Electron. Read each script before running it and confirm its data paths, shortcut and microphone effects. In particular, the older wake-manager test assumes a prototype device index; it is not a general acceptance test for new computers.

Do not report a passed default suite as verified human English wake-up. End-to-end voice confirmation requires a person to speak the phrase and observe Codex Voice starting and the microphone handoff.

## Windows portable candidate

See [candidate downloads and verification](DOWNLOADS.en.md) for the manually triggered GitHub build. It does not automatically publish Releases.

See [Windows signing and release](SIGNING.en.md) for certificate preparation and verification. Preflight is read-only; actual signing requires an explicitly supplied certificate.

Packaging does not publish a GitHub Release. The current target is Windows x64, using an unarchived Electron `resources/app` layout so Python and PowerShell resources remain executable.

```powershell
npm.cmd run package:portable -- --out C:\tmp\codex\YYYY-MM-DD-aero-release
```

Run `AERO.exe` from the complete output folder; Node.js is not required. Do not distribute the exe alone. Existing outputs are never overwritten. The folder includes licensing, getting-started notes and per-file SHA-256 checksums, but no models, personal settings, logs or development dependency tree. This preview is unsigned and retains Electron's default executable file icon; the app and tray use AERO branding.

Create a dedicated profile before the isolated startup check:

```powershell
$env:AERO_SMOKE_PROFILE = 'C:\tmp\codex\YYYY-MM-DD-aero-release\smoke-profile'
New-Item -ItemType Directory -Force -Path $env:AERO_SMOKE_PROFILE
# Replace with your actual output path:
& 'C:\tmp\codex\YYYY-MM-DD-aero-release\AERO-0.1.0-win-x64\AERO.exe' --package-smoke
```

`PACKAGE_SMOKE_OK` confirms packaged page, settings, six lights and resource loading. It intentionally does not connect to Codex or access a microphone, and is not desktop end-to-end validation. Its dedicated profile leaves existing settings untouched.

`node scripts/codex-readonly-smoke.cjs` explicitly checks the real backend without writing. It reports only connection state, thread count and effort choices, never submitting tasks, switching threads or changing configuration. It is excluded from default tests.

Before release, still verify real task navigation and status changes, effort application, tray exit, window dragging, first-user runtime downloads and human English wake-up. Publishing a public Release requires separate confirmation of scope.

## Change boundaries

- Preserve `contextIsolation`, renderer sandboxing and preload boundaries; do not expose Node privileges to the UI.
- Use mocked state in ordinary tests. Run real backend, voice, download and hotkey tests separately and explicitly.
- Keep one wake listener instance and release the microphone before triggering Voice. Do not substitute a guessed timer for a reliable session-end signal when considering automatic restart.
- Do not commit models, runtimes, logs, login credentials or personal configuration. Do not record raw audio.
- Both bars share light-color meanings. Respect reduced-motion preferences. Verify window-motion changes on real Windows; source assertions alone are insufficient.

## Presentation assets

`docs/images/aero-*.png` contains README assets. `aero-promo-*` files are campaign illustrations; the other four files are actual component demonstration screenshots. English campaign editions use the `-en` suffix. Actual screenshots remain in Chinese because the application UI is currently Chinese. Brand direction and localization copy are recorded in the [visual direction notes](promo-art-direction.md), currently in Chinese.

To render actual components again, build first and assign a task-specific temporary directory for isolated Electron configuration:

```powershell
$env:AERO_DOCS_TEMP = 'C:\tmp\codex\YYYY-MM-DD-aero-docs'
New-Item -ItemType Directory -Force -Path $env:AERO_DOCS_TEMP
.\node_modules\electron\dist\electron.exe scripts/render-readme.cjs
```

The script uses fictional threads and starts neither a real backend nor a listener, but updates the four component screenshots in `docs/images`. Inspect the images and differences before committing. Temporary configuration can be recycled after the process exits according to project rules; preserve formal assets and existing user configuration.
