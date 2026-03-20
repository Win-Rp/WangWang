import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

type DbCallback = (this: any, err: Error | null, rows?: any[]) => void
type DbGetCallback = (this: any, err: Error | null, row?: any) => void

type DbLike = {
  serialize: (fn: () => void) => void
  run: (sql: string, params?: any[] | DbCallback, cb?: DbCallback) => void
  all: (sql: string, params: any[], cb: DbCallback) => void
  get: (sql: string, params: any[], cb: DbGetCallback) => void
}

type FallbackState = {
  users: Array<{
    id: string
    email: string
    password_hash: string
    password_salt: string
    password_iters: number
    created_at: string
  }>
  sessions: Array<{
    id: string
    user_id: string
    token_hash: string
    expires_at: string
    created_at: string
  }>
  projects: Array<{
    id: string
    user_id: string | null
    name: string
    canvas_data: string | null
    created_at: string
    updated_at: string
  }>
  api_configs: Array<{
    id: string
    user_id: string | null
    category: string
    provider: string
    base_url: string
    api_key: string
    is_active: number | boolean
    is_verified: number | boolean
    created_at: string
  }>
  models: Array<{
    id: string
    api_config_id: string
    model_id: string
    name: string
    is_default: number | boolean
  }>
  agents: Array<{
    id: string
    user_id: string | null
    name: string
    system_prompt: string
    created_at: string
    updated_at: string
  }>
  skills: Array<{
    id: string
    user_id: string | null
    name: string
    content: string
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
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      api_configs: Array.isArray(parsed.api_configs) ? parsed.api_configs : [],
      models: Array.isArray(parsed.models) ? parsed.models : [],
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    }
  } catch {
    return { users: [], sessions: [], projects: [], api_configs: [], models: [], agents: [], skills: [] }
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
        if (/^\s*insert\s+into\s+users\s*/i.test(sql)) {
          const [id, email, password_hash, password_salt, password_iters] = params
          state.users.unshift({
            id,
            email,
            password_hash,
            password_salt,
            password_iters: Number(password_iters),
            created_at: now,
          })
          persist(state)
          cb?.call({ lastID: id, changes: 1 }, null)
          return
        }

        if (/^\s*insert\s+into\s+sessions\s*/i.test(sql)) {
          const [id, user_id, token_hash, expires_at] = params
          state.sessions.unshift({
            id,
            user_id,
            token_hash,
            expires_at,
            created_at: now,
          })
          persist(state)
          cb?.call({ lastID: id, changes: 1 }, null)
          return
        }

        if (/^\s*delete\s+from\s+sessions\s+where\s+token_hash\s*=/i.test(sql)) {
          const [token_hash] = params
          const initialLen = state.sessions.length
          state.sessions = state.sessions.filter((s) => s.token_hash !== token_hash)
          const changed = initialLen !== state.sessions.length
          if (changed) persist(state)
          cb?.call({ changes: changed ? 1 : 0 }, null)
          return
        }

        if (/^\s*insert\s+into\s+projects\s*/i.test(sql)) {
          const [id, user_id, name, canvas_data] = params
          state.projects.unshift({
            id,
            user_id: user_id ?? null,
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
          const [name, canvas_data, id, user_id] = params
          const idx = state.projects.findIndex((p) => p.id === id && String(p.user_id || '') === String(user_id || ''))
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
          const [id, user_id, name, system_prompt] = params
          state.agents.unshift({
            id,
            user_id: user_id ?? null,
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
          const [name, system_prompt, id, user_id] = params
          const idx = state.agents.findIndex((a) => a.id === id && String(a.user_id || '') === String(user_id || ''))
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
          const [id, user_id] = params
          const initialLen = state.agents.length
          state.agents = state.agents.filter((a) => !(a.id === id && String(a.user_id || '') === String(user_id || '')))
          const changed = initialLen !== state.agents.length
          if (changed) persist(state)
          cb?.call({ changes: changed ? 1 : 0 }, null)
          return
        }

        if (/^\s*insert\s+into\s+skills\s*/i.test(sql)) {
          const [id, user_id, name, content] = params
          state.skills.unshift({
            id,
            user_id: user_id ?? null,
            name,
            content,
            created_at: now,
            updated_at: now,
          })
          persist(state)
          cb?.call({ lastID: id, changes: 1 }, null)
          return
        }

        if (/^\s*update\s+skills\s+set\s+/i.test(sql)) {
          const [name, content, id, user_id] = params
          const idx = state.skills.findIndex((s) => s.id === id && String(s.user_id || '') === String(user_id || ''))
          if (idx >= 0) {
            state.skills[idx] = {
              ...state.skills[idx],
              name,
              content,
              updated_at: now,
            }
            persist(state)
          }
          cb?.call({ changes: idx >= 0 ? 1 : 0 }, null)
          return
        }

        if (/^\s*delete\s+from\s+skills\s+where\s+id\s*=/i.test(sql)) {
          const [id, user_id] = params
          const initialLen = state.skills.length
          state.skills = state.skills.filter((s) => !(s.id === id && String(s.user_id || '') === String(user_id || '')))
          const changed = initialLen !== state.skills.length
          if (changed) persist(state)
          cb?.call({ changes: changed ? 1 : 0 }, null)
          return
        }

        if (/^\s*update\s+projects\s+set\s+user_id\s*=/i.test(sql)) {
          const [user_id] = params
          let changed = 0
          state.projects = state.projects.map((p) => {
            if (p.user_id == null) {
              changed++
              return { ...p, user_id }
            }
            return p
          })
          if (changed) persist(state)
          cb?.call({ changes: changed }, null)
          return
        }

        if (/^\s*update\s+agents\s+set\s+user_id\s*=/i.test(sql)) {
          const [user_id] = params
          let changed = 0
          state.agents = state.agents.map((a) => {
            if (a.user_id == null) {
              changed++
              return { ...a, user_id }
            }
            return a
          })
          if (changed) persist(state)
          cb?.call({ changes: changed }, null)
          return
        }

        if (/^\s*update\s+skills\s+set\s+user_id\s*=/i.test(sql)) {
          const [user_id] = params
          let changed = 0
          state.skills = state.skills.map((s) => {
            if (s.user_id == null) {
              changed++
              return { ...s, user_id }
            }
            return s
          })
          if (changed) persist(state)
          cb?.call({ changes: changed }, null)
          return
        }

        if (/^\s*update\s+api_configs\s+set\s+user_id\s*=/i.test(sql)) {
          const [user_id] = params
          let changed = 0
          state.api_configs = state.api_configs.map((c) => {
            if (c.user_id == null) {
              changed++
              return { ...c, user_id }
            }
            return c
          })
          if (changed) persist(state)
          cb?.call({ changes: changed }, null)
          return
        }

        if (/^\s*insert\s+into\s+api_configs\s*/i.test(sql)) {
          const [id, user_id, category, provider, base_url, api_key] = params
          state.api_configs.unshift({
            id,
            user_id: user_id ?? null,
            category,
            provider,
            base_url,
            api_key,
            is_active: 1,
            is_verified: 0,
            created_at: now,
          })
          persist(state)
          cb?.call({ lastID: id, changes: 1 }, null)
          return
        }

        if (/^\s*update\s+api_configs\s+set\s+category\s*=/i.test(sql)) {
          const [category, provider, base_url, api_key, is_verified, id, user_id] = params
          const idx = state.api_configs.findIndex((c) => c.id === id && String(c.user_id || '') === String(user_id || ''))
          if (idx >= 0) {
            state.api_configs[idx] = {
              ...state.api_configs[idx],
              category,
              provider,
              base_url,
              api_key,
              is_verified,
            }
            persist(state)
          }
          cb?.call({ changes: idx >= 0 ? 1 : 0 }, null)
          return
        }

        if (/^\s*delete\s+from\s+api_configs\s+where\s+id\s*=/i.test(sql)) {
          const [id, user_id] = params
          const initialLen = state.api_configs.length
          state.api_configs = state.api_configs.filter((c) => !(c.id === id && String(c.user_id || '') === String(user_id || '')))
          const changed = initialLen !== state.api_configs.length
          if (changed) {
            state.models = state.models.filter((m) => m.api_config_id !== id)
            persist(state)
          }
          cb?.call({ changes: changed ? 1 : 0 }, null)
          return
        }

        if (/^\s*delete\s+from\s+models\s+where\s+api_config_id\s*=/i.test(sql)) {
          const [api_config_id] = params
          const initialLen = state.models.length
          state.models = state.models.filter((m) => m.api_config_id !== api_config_id)
          const changed = initialLen !== state.models.length
          if (changed) persist(state)
          cb?.call({ changes: changed ? 1 : 0 }, null)
          return
        }

        if (/^\s*insert\s+into\s+models\s*/i.test(sql)) {
          const [id, api_config_id, model_id, name, is_default] = params
          state.models.unshift({
            id,
            api_config_id,
            model_id,
            name,
            is_default,
          })
          persist(state)
          cb?.call({ lastID: id, changes: 1 }, null)
          return
        }

        if (/^\s*update\s+api_configs\s+set\s+is_verified\s*=/i.test(sql)) {
          const sqlLower = sql.toLowerCase()
          if (sqlLower.includes('or') && sqlLower.includes('provider') && sqlLower.includes('base_url') && sqlLower.includes('api_key')) {
            const [user_id, id, provider, base_url, api_key] = params
            let changed = 0
            state.api_configs = state.api_configs.map((c) => {
              if (String(c.user_id || '') !== String(user_id || '')) return c
              const match =
                c.id === id || (c.provider === provider && c.base_url === base_url && c.api_key === api_key)
              if (!match) return c
              if (Number(c.is_verified) === 1) return c
              changed++
              return { ...c, is_verified: 1 }
            })
            if (changed) persist(state)
            cb?.call({ changes: changed }, null)
            return
          }

          const [user_id, id] = params
          let changed = 0
          state.api_configs = state.api_configs.map((c) => {
            if (String(c.user_id || '') !== String(user_id || '')) return c
            if (c.id !== id) return c
            if (Number(c.is_verified) === 0) return c
            changed++
            return { ...c, is_verified: 0 }
          })
          if (changed) persist(state)
          cb?.call({ changes: changed }, null)
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
          const [user_id] = params || []
          const filtered = [...state.projects].filter((p) => String(p.user_id || '') === String(user_id || ''))
          const rows = filtered.sort((a, b) => {
            return (b.updated_at || '').localeCompare(a.updated_at || '')
          })
          cb.call({}, null, rows)
          return
        }

        if (/select\s+\*\s+from\s+agents/i.test(sql)) {
          const [user_id] = params || []
          const filtered = [...state.agents].filter((a) => String(a.user_id || '') === String(user_id || ''))
          const rows = filtered.sort((a, b) => {
            return (b.created_at || '').localeCompare(a.created_at || '')
          })
          cb.call({}, null, rows)
          return
        }

        if (/select\s+\*\s+from\s+skills/i.test(sql)) {
          const [user_id] = params || []
          const filtered = [...state.skills].filter((s) => String(s.user_id || '') === String(user_id || ''))
          const rows = filtered.sort((a, b) => {
            return (b.created_at || '').localeCompare(a.created_at || '')
          })
          cb.call({}, null, rows)
          return
        }

        if (/select\s+\*\s+from\s+users/i.test(sql)) {
          if (/where\s+email\s*=/i.test(sql)) {
            const [email] = params || []
            const row = state.users.find((u) => u.email === email)
            cb.call({}, null, row ? [row] : [])
            return
          }
          cb.call({}, null, [...state.users])
          return
        }

        if (/from\s+sessions\s+s\s+join\s+users\s+u/i.test(sql) && /where\s+s\.token_hash\s*=/i.test(sql)) {
          const [token_hash] = params || []
          const session = state.sessions.find((s) => s.token_hash === token_hash)
          if (!session) {
            cb.call({}, null, [])
            return
          }
          const user = state.users.find((u) => u.id === session.user_id)
          if (!user) {
            cb.call({}, null, [])
            return
          }
          cb.call({}, null, [
            {
              user_id: session.user_id,
              token_hash: session.token_hash,
              expires_at: session.expires_at,
              id: user.id,
              email: user.email,
            },
          ])
          return
        }

        if (/from\s+api_configs/i.test(sql) && !/from\s+api_configs\s+ac/i.test(sql)) {
          if (/where\s+id\s*=\s*\?/i.test(sql) && /user_id\s*=\s*\?/i.test(sql)) {
            const [id, user_id] = params || []
            const config = state.api_configs.find((c) => c.id === id && String(c.user_id || '') === String(user_id || ''))
            cb.call({}, null, config ? [config] : [])
            return
          }
        }

        if (/from\s+api_configs\s+ac/i.test(sql) && /left\s+join\s+models\s+m/i.test(sql)) {
          if (/json_group_array/i.test(sql)) {
            const [user_id] = params || []
            const configs = state.api_configs.filter((c) => String(c.user_id || '') === String(user_id || ''))
            const rows = configs.map((c) => {
              const models = state.models
                .filter((m) => m.api_config_id === c.id)
                .map((m) => ({
                  id: m.id,
                  model_id: m.model_id,
                  name: m.name,
                  is_default: m.is_default,
                }))
              return { ...c, models: JSON.stringify(models) }
            })
            cb.call({}, null, rows)
            return
          }

          if (/where\s+ac\.category\s*=/i.test(sql) && /ac\.user_id\s*=/i.test(sql)) {
            const [category, user_id] = params || []
            const configs = state.api_configs.filter(
              (c) => c.category === category && String(c.user_id || '') === String(user_id || '')
            )
            const rows: any[] = []
            configs.forEach((c) => {
              const models = state.models.filter((m) => m.api_config_id === c.id)
              if (models.length === 0) {
                rows.push({
                  api_config_id: c.id,
                  provider: c.provider,
                  base_url: c.base_url,
                  api_key: c.api_key,
                  model_id: null,
                  model_name: null,
                  is_default: null,
                })
                return
              }
              models.forEach((m) => {
                rows.push({
                  api_config_id: c.id,
                  provider: c.provider,
                  base_url: c.base_url,
                  api_key: c.api_key,
                  model_id: m.model_id,
                  model_name: m.name,
                  is_default: m.is_default,
                })
              })
            })
            cb.call({}, null, rows)
            return
          }

          if (/where\s+ac\.id\s*=\s*\?/i.test(sql) && /ac\.user_id\s*=\s*\?/i.test(sql)) {
            const [id, user_id] = params || []
            const config = state.api_configs.find((c) => c.id === id && String(c.user_id || '') === String(user_id || ''))
            if (!config) {
              cb.call({}, null, [])
              return
            }
            const models = state.models.filter((m) => m.api_config_id === config.id)
            if (models.length === 0) {
              cb.call({}, null, [
                {
                  id: config.id,
                  category: config.category,
                  provider: config.provider,
                  base_url: config.base_url,
                  api_key: config.api_key,
                  model_id: null,
                },
              ])
              return
            }
            const rows: any[] = models.map((m) => ({
              id: config.id,
              category: config.category,
              provider: config.provider,
              base_url: config.base_url,
              api_key: config.api_key,
              model_id: m.model_id,
            }))
            cb.call({}, null, rows)
            return
          }
        }

        cb.call({}, null, [])
      } catch (e: any) {
        cb.call({}, e, [])
      }
    },
    get(sql, params, cb) {
      this.all(sql, params, (err, rows) => {
        if (err) {
          cb.call({}, err, undefined)
          return
        }
        cb.call({}, null, Array.isArray(rows) ? rows[0] : undefined)
      })
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
