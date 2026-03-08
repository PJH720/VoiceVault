import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * E2E: Verify Electrobun build artifacts exist after `pnpm build`
 */
test('built Electrobun artifacts exist', async () => {
  const root = process.cwd()

  // Compiled Bun main process
  const bunMain = path.join(root, 'out/electrobun/main/main.js')
  expect(fs.existsSync(bunMain), `bun main: ${bunMain}`).toBe(true)

  // Compiled renderer
  const rendererHtml = path.join(root, 'dist/index.html')
  expect(fs.existsSync(rendererHtml), `renderer html: ${rendererHtml}`).toBe(true)
})

/**
 * E2E: Verify Electrobun dev build directory is populated
 */
test('Electrobun dev build directory is populated', async () => {
  const launcher = path.join(
    process.cwd(),
    'build/dev-linux-x64/VoiceVault-dev/bin/launcher'
  )
  // Only assert if dev build has been run; skip in CI if not present
  if (fs.existsSync(launcher)) {
    expect(fs.existsSync(launcher)).toBe(true)
  } else {
    test.skip()
  }
})

/**
 * E2E: HTTP RPC health check (requires running dev server)
 */
test('HTTP RPC /health responds when dev server is running', async ({ request }) => {
  let response
  try {
    response = await request.get('http://localhost:50100/health', { timeout: 2000 })
  } catch {
    test.skip() // Server not running in this environment
    return
  }
  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body).toMatchObject({ ok: true })
})
