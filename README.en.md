# Codex Dream Skin Manager

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

<p align="center">
  <strong>A cross-platform desktop theme manager for Codex on macOS and Windows.</strong><br>
  Theme library · Theme studio · Groups · Live switching · Diagnostics
</p>

<p align="center">
  <a href="https://github.com/LiamTaan/codex-dream/releases/latest">Download</a>
  · <a href="https://github.com/Fei-Away/Codex-Dream-Skin">Open-source foundation</a>
  · <a href="./LICENSE">MIT License</a>
</p>

> Unofficial and not affiliated with OpenAI. This project does not modify the official Codex `.app`, `app.asar`, or WindowsApps package.

<p align="center">
  <img src="docs/images/desktop-theme-library.png" alt="Codex Dream Skin Manager theme library" width="960">
</p>

## What this repository provides

This repository now ships a complete desktop application rather than only platform scripts:

- install, start, pause, and restore the theme runtime from one UI;
- browse bundled and personal themes with search, source filters, and groups;
- create a theme from a local image and configure appearance, focal point, safe area, and task-page treatment;
- rename, group, and delete personal themes;
- hot-apply themes while Codex is running in most cases;
- inspect runtime, CDP, and diagnostic state;
- use the same Electron control panel on macOS and Windows.

## Upstream foundation and attribution

This project is a derivative of [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin).

The upstream project established the core macOS and Windows theming foundation: local CDP injection, platform runtimes, restore behavior, and preset management. This repository retains and maintains that foundation while adding the cross-platform Electron manager, theme studio, grouping, broader native-surface styling, memory-pressure fixes, tests, and desktop release automation.

We gratefully acknowledge the upstream maintainers and contributors. The source is not being presented as an unrelated clean-room implementation. See [LICENSE](./LICENSE), [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md), and [macos/NOTICE.md](./macos/NOTICE.md).

## v1.1.5 highlights

- Windows theme switches now reuse and verify the active injector session instead of restarting the watcher or Codex for every change, preventing a healthy switch from remaining permanently busy.
- Windows diagnostics now read the managed `active-theme` directory, so installed theme resources are reported accurately.

## v1.1.4 highlights

- Windows theme switches now have an explicit command timeout as a last-resort guard for an unhealthy external process.

## v1.1.3 highlights

- fix the Windows renderer payload so its reported injected version always matches the managed runtime;
- retain the existing macOS runtime and packaging paths unchanged.

## v1.1.2 highlights

- detect managed-runtime version drift and require an upgrade after replacing or re-downloading the desktop app;
- stop the previous macOS injector before replacing its runtime directory, avoiding PID/launchd handoff races;
- prevent the in-Codex applying indicator from remaining indefinitely when a filesystem event is missed;
- add dismissible, automatically expiring desktop error notices that clear after a successful action;
- perform real deep CDP diagnostics and label `127.0.0.1` as the expected secure loopback address.

## v1.1.1 highlights

- fixed incomplete macOS application-bundle signing that caused quarantined downloads to be reported as damaged;
- the release workflow now mounts both arm64 and x64 DMGs and verifies the embedded app signature, bundle identifier, and architecture;
- macOS packages currently use a complete ad-hoc bundle signature, which is not the same as Developer ID signing or Apple notarization.

## v1.1.0 highlights

- redesigned theme library, theme studio, and diagnostics UI;
- theme renaming, custom groups, group filtering, and personal-theme deletion;
- adjustable image focal point and improved cross-route artwork placement;
- broader styling for sidebars, settings, menus, and status controls;
- rate-limited observers and bounded caches to reduce long-running memory and GC pressure;
- stable theme-library rendering without rebuilding image DOM every refresh;
- new bundled `001` theme, bringing the library to three bundled themes;
- stronger macOS and Windows theme seeding, image validation, and automated tests.

## Install

Download the latest package from [GitHub Releases](https://github.com/LiamTaan/codex-dream/releases/latest):

- macOS Apple Silicon: the `.dmg` containing `arm64`;
- macOS Intel: the x64 `.dmg`;
- Windows: the `.exe` installer.

On first launch, click **Install Runtime**, wait for the runtime-ready state, then apply a bundled theme or import your own image in Theme Studio.

The macOS package now has a complete ad-hoc bundle signature, but it is not yet signed with an Apple Developer ID or notarized by Apple. The first launch may therefore show an unidentified-developer warning and require approval under **System Settings → Privacy & Security**; it should no longer be reported as damaged under normal conditions. Windows development currently requires Node.js 22 or newer.

## Development

```bash
cd desktop
npm install
npm start
```

Development mode uses the platform source in this repository, so DMG/EXE packaging is not required for local iteration.

```bash
cd desktop && npm run check
cd .. && ./macos/tests/run-tests.sh
```

Run the full Windows PowerShell suite on Windows or in an environment with PowerShell 7:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
```

## Architecture

```text
Electron desktop manager
        │
        ├── macOS Shell / Node runtime
        └── Windows PowerShell / Node runtime
                         │
                         ▼
                 loopback CDP session
                         │
                         ▼
                 native Codex UI + theme
```

The sidebar, editor, project picker, and composer remain native Codex controls. The project applies styles through Chromium DevTools Protocol on `127.0.0.1`; it does not replace the application with a screenshot.

## Bundled themes

- `001`
- `Arina Hashimoto / 桥本有菜`
- `Gothic Void Crusade`

Artwork rights are separate from the MIT software license. Confirm likeness, asset, trademark, and redistribution rights before publishing or using bundled/user-provided imagery commercially.

## Safety and limitations

- CDP is loopback-only, but untrusted local software should not run while the debugging port is open.
- Official application binaries and code signatures are not modified.
- API keys, base URLs, and model-provider settings are never changed.
- Codex/Chromium updates may require selector adjustments.
- Chromium RSS may remain reserved after garbage collection; high RSS alone does not prove a JavaScript object leak.

## Repository layout

| Directory | Purpose |
|---|---|
| [`desktop/`](./desktop/) | Shared Electron manager for macOS and Windows |
| [`macos/`](./macos/) | macOS runtime, scripts, presets, and tests |
| [`windows/`](./windows/) | Windows runtime, PowerShell actions, and tests |
| [`docs/`](./docs/) | Platform notes, theme assets, and development docs |

## License and acknowledgements

- Software source: [MIT License](./LICENSE)
- Core upstream foundation: [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)
- Third-party and derivative notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
- OpenAI, Codex, ChatGPT, and related marks belong to their respective owners.
- This project is not affiliated with, sponsored by, or endorsed by OpenAI.
