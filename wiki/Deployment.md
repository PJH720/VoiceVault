# Deployment

Packaging and distributing VoiceVault as a standalone desktop application.

> **No Docker. No server. No Python.** VoiceVault ships as a single self-contained binary
> via `electrobun package`. Users run the app directly — no runtime installation required.

---

## Build for Production

### 1. Full build

```bash
pnpm build
```

This runs two steps in sequence:
1. `vite build` — compiles the React 19 renderer into `src/renderer/dist/`
2. `bun build src/main/main.ts` — bundles the Bun Worker into `out/electrobun/main/main.js`

### 2. Package for target platform

```bash
# Linux — produces .AppImage
pnpm package:linux

# macOS — produces .app bundle
pnpm package:mac
```

Packaged output lands in `out/` (or the path configured in `electrobun.config.ts`).

---

## AppImage (Linux)

The `.AppImage` is fully self-contained — it includes:
- The Electrobun launcher (Zig binary)
- The Bun Worker bundle (`index.js`)
- `libNativeWrapper.so`, `libasar.so`, `libwebgpu_dawn.so`
- The compiled renderer (`src/renderer/dist/`)

**AI binaries (`whisper-cli`, `llama-cli`) and models are NOT bundled** — they must be
present on the user's machine. On first launch, VoiceVault will:
1. Check for `whisper-cli` and `llama-cli` in the expected locations
2. If missing, show a setup screen with installation instructions
3. Check for models in `~/.voicevault/models/`
4. If missing, offer to download the `ggml-tiny.en.bin` Whisper model automatically

### User installation

```bash
chmod +x VoiceVault-0.7.0.AppImage
./VoiceVault-0.7.0.AppImage
```

No root required. No system-level install.

---

## macOS (.app)

```bash
pnpm package:mac
```

For distribution outside the Mac App Store, the app must be code-signed and notarized:

```bash
# Code sign (requires Apple Developer certificate)
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  VoiceVault.app

# Notarize
xcrun notarytool submit VoiceVault.app \
  --apple-id "your@email.com" \
  --password "@keychain:AC_PASSWORD" \
  --team-id TEAMID \
  --wait
```

---

## CI/CD — GitHub Actions

A release packaging job is planned for v0.8.0 (#221). The intended workflow:

```yaml
# .github/workflows/package.yml (planned)
on:
  push:
    tags: ['v*']

jobs:
  package-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt install libgtk-4-dev libwebkit2gtk-4.1-dev
      - run: curl -fsSL https://bun.sh/install | bash
      - run: pnpm install
      - run: pnpm package:linux
      - uses: actions/upload-artifact@v4
        with:
          name: VoiceVault-linux
          path: out/*.AppImage

  package-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm package:mac
      - uses: actions/upload-artifact@v4
        with:
          name: VoiceVault-mac
          path: out/*.app
```

---

## Data Locations

All user data is stored in `~/.voicevault/` — never in the app bundle.

| Path | Contents |
|---|---|
| `~/.voicevault/voicevault.db` | SQLite database (recordings, summaries, settings) |
| `~/.voicevault/models/` | Whisper and LLM model files |
| `~/.voicevault/recordings/` | Raw audio recordings |
| `~/.voicevault/exports/` | Obsidian Markdown export files |

Users can back up or migrate their data by copying `~/.voicevault/`.

---

## Auto-Updater (Planned — v0.8.0)

Issue [#224](https://github.com/PJH720/VoiceVault/issues/224) tracks an in-app updater
that checks GitHub Releases and applies updates with a one-click restart. Until then,
users update by downloading a new AppImage or `.app` and replacing the old one.
