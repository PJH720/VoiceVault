import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['**/tests/unit/renderer/**/*.test.tsx', 'jsdom']],
    globals: true
  }
})
