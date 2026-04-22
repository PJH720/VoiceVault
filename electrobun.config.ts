import type { ElectrobunConfig } from 'electrobun/dist/api/bun/ElectrobunConfig';

const config: ElectrobunConfig = {
  app: {
    name: 'VoiceVault',
    identifier: 'com.voicevault.app',
    version: '0.7.0',
    description: 'AI voice recorder: transcribes, summarizes, and auto-organizes recordings',
  },
  build: {
    // Output directories
    buildFolder: 'build',
    artifactFolder: 'artifacts',

    // Bun Worker entry (main process)
    bun: {
      entrypoint: 'src/main/main.ts',
    },

    // Renderer views
    views: {
      main: {
        entrypoint: 'src/renderer/src/main.tsx',
      },
    },

    // Linux packaging config
    linux: {
      bundleCEF: false,          // GTK-only WebView — no Chromium/CEF dependency
      bundleWGPU: false,         // No WebGPU needed
      icon: 'build/icon.png',   // Used for desktop shortcut created by installer
    },

    // macOS packaging config
    mac: {
      bundleCEF: false,
      bundleWGPU: false,
      codesign: false,           // Set to true when ELECTROBUN_DEVELOPER_ID is configured
      notarize: false,           // Set to true when Apple credentials are configured
      icons: 'build/icon.iconset',
      entitlements: {
        'com.apple.security.device.audio-input': 'VoiceVault needs microphone access to record audio.',
        'com.apple.security.cs.allow-jit': true,
        'com.apple.security.cs.allow-unsigned-executable-memory': true,
      },
    },

    // Lifecycle hooks — called by electrobun build at specific stages
    scripts: {
      // Runs after the app bundle is built but before packaging/compression.
      // Use this to inject bundled whisper-cli / llama-cli static binaries
      // into the build output if they're present in scripts/bin/.
      postBuild: 'scripts/post-build.sh',
    },
  },

  // Release / auto-updater config (populated when deploying)
  release: {
    baseUrl: '',          // Set to GitHub Releases URL when deploying, e.g.:
                          // 'https://github.com/PJH720/VoiceVault/releases/latest/download'
    generatePatch: false, // Enable after first stable release exists to generate delta patches
  },

  runtime: {
    exitOnLastWindowClosed: true,
  },
};

export default config;
