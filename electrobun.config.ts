import type { ElectrobunConfig } from 'electrobun/dist/api/bun/ElectrobunConfig';

const config: ElectrobunConfig = {
  app: {
    name: 'VoiceVault',
    identifier: 'com.voicevault.app',
    version: '0.7.0',
    description: 'AI voice recorder: transcribes, summarizes, and auto-organizes recordings',
  },
  build: {
    bun: {
      entrypoint: 'src/main/main.ts',
    },
    views: {
      main: {
        entrypoint: 'src/renderer/src/main.tsx',
      },
    },
    linux: {
      bundleCEF: false,
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
};

export default config;
