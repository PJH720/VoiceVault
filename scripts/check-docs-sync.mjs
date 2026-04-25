import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getMajorVersion(versionRange) {
  const match = String(versionRange).match(/\d+/)
  if (!match) {
    throw new Error(`Could not parse major version from "${versionRange}"`)
  }
  return match[0]
}

function validatePackageScript(scriptName, scriptValue) {
  if (typeof scriptValue !== 'string') {
    throw new Error(`Missing package script: ${scriptName}`)
  }
  if (!scriptValue.includes('build --env=stable')) {
    throw new Error(
      `Unexpected ${scriptName} script. Expected to include "build --env=stable", got "${scriptValue}"`
    )
  }
}

const rootDir = resolve(new URL('..', import.meta.url).pathname)
const packageJsonPath = resolve(rootDir, 'package.json')
const readmePath = process.env.DOCS_SYNC_README_PATH
  ? resolve(process.env.DOCS_SYNC_README_PATH)
  : resolve(rootDir, 'README.md')
const claudePath = process.env.DOCS_SYNC_CLAUDE_PATH
  ? resolve(process.env.DOCS_SYNC_CLAUDE_PATH)
  : resolve(rootDir, 'CLAUDE.md')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
const readme = readFileSync(readmePath, 'utf-8')
const claude = readFileSync(claudePath, 'utf-8')

const viteMajor = getMajorVersion(packageJson.devDependencies?.vite)
const lintScript = packageJson.scripts?.lint
const packageLinuxScript = packageJson.scripts?.['package:linux']
const packageMacScript = packageJson.scripts?.['package:mac']

validatePackageScript('package:linux', packageLinuxScript)
validatePackageScript('package:mac', packageMacScript)

const checks = [
  {
    file: 'README.md',
    description: `UI stack uses Vite ${viteMajor}`,
    ok: new RegExp(`React 19\\s*·\\s*Vite ${escapeRegExp(viteMajor)}\\s*·`).test(readme)
  },
  {
    file: 'README.md',
    description: 'lint command description matches package.json',
    ok: lintScript === 'eslint --cache .' && /pnpm lint\s+# ESLint$/m.test(readme)
  },
  {
    file: 'README.md',
    description: 'package:linux docs line matches package.json behavior',
    ok: /pnpm package:linux\s+# pnpm build \+ electrobun build --env=stable$/m.test(readme)
  },
  {
    file: 'README.md',
    description: 'package:mac docs line matches package.json behavior',
    ok: /pnpm package:mac\s+# pnpm build \+ electrobun build --env=stable$/m.test(readme)
  },
  {
    file: 'CLAUDE.md',
    description: `renderer tech table uses Vite ${viteMajor}`,
    ok: new RegExp(`React 19 \\+ Vite ${escapeRegExp(viteMajor)} \\+`).test(claude)
  },
  {
    file: 'CLAUDE.md',
    description: 'package:linux command comment is synced',
    ok: /pnpm package:linux\s+# pnpm build \+ electrobun build --env=stable$/m.test(claude)
  },
  {
    file: 'CLAUDE.md',
    description: 'package:mac command comment is synced',
    ok: /pnpm package:mac\s+# pnpm build \+ electrobun build --env=stable$/m.test(claude)
  }
]

const failures = checks.filter((item) => !item.ok)

if (failures.length > 0) {
  console.error('Documentation sync check failed:')
  for (const failure of failures) {
    console.error(`- [${failure.file}] ${failure.description}`)
  }
  process.exit(1)
}

console.log('Docs sync OK: README.md and CLAUDE.md are aligned with package.json.')
