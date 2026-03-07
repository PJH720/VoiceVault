import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test('built electron artifacts exist', async () => {
  const mainEntry = path.join(process.cwd(), 'out/main/index.js')
  const preloadEntry = path.join(process.cwd(), 'out/preload/index.js')
  const rendererHtml = path.join(process.cwd(), 'out/renderer/index.html')

  expect(fs.existsSync(mainEntry)).toBe(true)
  expect(fs.existsSync(preloadEntry)).toBe(true)
  expect(fs.existsSync(rendererHtml)).toBe(true)
})
