import { Database } from 'bun:sqlite'
import { join } from 'path'
import { mkdirSync, existsSync, readdirSync, readFileSync, statSync, copyFileSync } from 'fs'
import { getUserDataPath } from '../types'

let _db: Database | null = null

function getDbPath(): string {
  return join(getUserDataPath(), 'voicevault.db')
}

function loadMigrations(): Array<{ id: number; fileName: string; sql: string }> {
  const candidates = [
    join(import.meta.dir, '../../main/migrations'),
    join(process.cwd(), 'src/main/migrations')
  ]
  const migrationsDir = candidates.find((dir) => existsSync(dir))
  if (!migrationsDir) return []

  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({
      id: Number(file.split('_')[0]),
      fileName: file,
      sql: readFileSync(join(migrationsDir, file), 'utf-8')
    }))
    .filter((entry) => Number.isFinite(entry.id) && entry.id > 0)
}

function backupDatabase(dbPath: string): void {
  if (!existsSync(dbPath)) return
  const size = statSync(dbPath).size
  if (size <= 0) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${dbPath}.${stamp}.bak`
  copyFileSync(dbPath, backupPath)
}

export function runMigrations(db: Database): void {
  const currentVersion = db.query<{ user_version: number }, []>('PRAGMA user_version').get()
    ?.user_version ?? 0
  const migrations = loadMigrations()
  if (migrations.length === 0) return

  if (currentVersion < migrations.length) {
    backupDatabase(getDbPath())
  }

  const pending = migrations.filter((m) => m.id > currentVersion)
  for (const migration of pending) {
    const statements = migration.sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const hasAlterTable = statements.some((s) => /^\s*ALTER\s+TABLE/i.test(s))

    if (hasAlterTable) {
      for (const stmt of statements) {
        db.exec(stmt)
      }
      db.exec(`PRAGMA user_version = ${migration.id}`)
    } else {
      db.transaction(() => {
        db.exec(migration.sql)
        db.exec(`PRAGMA user_version = ${migration.id}`)
      })()
    }
  }
}

export function getDb(): Database {
  if (_db) return _db

  const dbPath = getDbPath()
  mkdirSync(join(dbPath, '..'), { recursive: true })

  _db = new Database(dbPath)
  _db.exec('PRAGMA journal_mode = WAL')
  _db.exec('PRAGMA synchronous = NORMAL')
  _db.exec('PRAGMA foreign_keys = ON')

  runMigrations(_db)

  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}
