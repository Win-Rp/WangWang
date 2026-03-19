import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

type DbCallback = (this: any, err: Error | null, rows?: any[]) => void

type DbLike = {
  serialize: (fn: () => void) => void
  run: (sql: string, params?: any[] | DbCallback, cb?: DbCallback) => void
  all: (sql: string, params: any[], cb: DbCallback) => void
}

type FallbackState = {
  projects: Array<{
    id: string
    name: string
    canvas_data: string | null
    created_at: string
    updated_at: string
  }>
  api_configs: Array<any>
  models: Array<any>
  agents: Array<{
    id: string
    name: string
    system_prompt: string
    created_at: string
    updated_at: string
  }>
}

const fallbackFilePath = path.resolve(process.cwd(), 'wangwang.fallback-db.json')

const readFallbackState = (): FallbackState => {
  try {
    const raw = fs.readFileSync(fallbackFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      api_configs: Array.isArray(parsed.api_configs) ? parsed.api_configs : [],
      models: Array.isArray(parsed.models) ? parsed.models : [],
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
    }
  } catch {
    return { projects: [], api_configs: [], models: [], agents: [] }
  }
}

const writeFallbackState = (state: FallbackState) => {
  fs.writeFileSync(fallbackFilePath, JSON.stringify(state, null, 2), 'utf-8')
}

const createFallbackDb = (): DbLike => {
  const ensureState = () => readFallbackState()
  const persist = (state: FallbackState) => writeFallbackState(state)

  return {
    serialize(fn) {
      fn()
    },
    run(sql, paramsOrCb, maybeCb) {
      const params = Array.isArray(paramsOrCb) ? paramsOrCb : []
      const cb = (typeof paramsOrCb === 'function' ? paramsOrCb : maybeCb) as DbCallback | undefined

      const now = new Date().toISOString()
      const state = ensureState()

      try {
        if (/^\s*insert\s+into\s+projects\s*/i.test(sql)) {
          const [id, name, canvas_data] = params
          state.projects.unshift({
            id,
            name,
            canvas_data: canvas_data ?? null,
            created_at: now,
            updated_at: now,
          })
          persist(state)
          cb?.call({ lastID: id, changes: 1 }, null)
          return
        }

        if (/^\s*update\s+projects\s+set\s+/i.test(sql)) {
          const [name, canvas_data, id] = params
          const idx = state.projects.findIndex((p) => p.id === id)
          if (idx >= 0) {
            state.projects[idx] = {
              ...state.projects[idx],
              name,
              canvas_data: canvas_data ?? null,
              updated_at: now,
            }
            persist(state)
          }
          cb?.call({ changes: idx >= 0 ? 1 : 0 }, null)
          return
        }

        if (/^\s*insert\s+into\s+agents\s*/i.test(sql)) {
          const [id, name, system_prompt] = params
          state.agents.unshift({
            id,
            name,
            system_prompt,
            created_at: now,
            updated_at: now,
          })
          persist(state)
          cb?.call({ lastID: id, changes: 1 }, null)
          return
        }

        if (/^\s*update\s+agents\s+set\s+/i.test(sql)) {
          const [name, system_prompt, id] = params
          const idx = state.agents.findIndex((a) => a.id === id)
          if (idx >= 0) {
            state.agents[idx] = {
              ...state.agents[idx],
              name,
              system_prompt,
              updated_at: now,
            }
            persist(state)
          }
          cb?.call({ changes: idx >= 0 ? 1 : 0 }, null)
          return
        }

        if (/^\s*delete\s+from\s+agents\s+where\s+id\s*=/i.test(sql)) {
          const [id] = params
          const initialLen = state.agents.length
          state.agents = state.agents.filter((a) => a.id !== id)
          const changed = initialLen !== state.agents.length
          if (changed) persist(state)
          cb?.call({ changes: changed ? 1 : 0 }, null)
          return
        }

        cb?.call({ changes: 0 }, null)
      } catch (e: any) {
        cb?.call({}, e)
      }
    },
    all(sql, params, cb) {
      const state = ensureState()

      try {
        if (/select\s+\*\s+from\s+projects/i.test(sql)) {
          const rows = [...state.projects].sort((a, b) => {
            return (b.updated_at || '').localeCompare(a.updated_at || '')
          })
          cb.call({}, null, rows)
          return
        }

        if (/select\s+\*\s+from\s+agents/i.test(sql)) {
          const rows = [...state.agents].sort((a, b) => {
            return (b.created_at || '').localeCompare(a.created_at || '')
          })
          cb.call({}, null, rows)
          return
        }

        cb.call({}, null, [])
      } catch (e: any) {
        cb.call({}, e, [])
      }
    },
  }
}

let db: DbLike

try {
  const require = createRequire(import.meta.url)
  const sqlite3 = require('sqlite3')
  const sqlite = sqlite3.verbose()
  const dbPath = path.resolve(process.cwd(), 'wangwang.db')
  db = new sqlite.Database(dbPath, (err: any) => {
    if (err) {
      console.error('Error opening database:', err.message)
    } else {
      console.log('Connected to the SQLite database.')
    }
  })
} catch (_err: any) {
  console.warn('SQLite bindings unavailable, using fallback JSON DB.')
  db = createFallbackDb()
}

export default db
