import db from './index.ts';

export const initDb = () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iters INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      canvas_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      position TEXT NOT NULL,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )`,
    `CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_node_id TEXT NOT NULL,
      target_node_id TEXT NOT NULL,
      source_handle TEXT,
      target_handle TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )`,
    `CREATE TABLE IF NOT EXISTS api_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      category TEXT NOT NULL,
      provider TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      is_verified BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      api_config_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_default BOOLEAN DEFAULT 0,
      FOREIGN KEY (api_config_id) REFERENCES api_configs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  ];

  db.serialize(() => {
    queries.forEach((query) => {
      db.run(query, (err) => {
        if (err) {
          console.error('Error creating table:', err.message);
        }
      });
    });

    // Simple migrations: Add missing columns if they don't exist
    db.run(`ALTER TABLE api_configs ADD COLUMN is_verified BOOLEAN DEFAULT 0`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          // Column already exists, ignore
        } else {
          console.error('Migration error:', err.message);
        }
      } else {
        console.log('Migration: is_verified column added to api_configs.');
      }
    });

    db.run(`ALTER TABLE projects ADD COLUMN user_id TEXT`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
        } else {
          console.error('Migration error:', err.message);
        }
      }
    });

    db.run(`ALTER TABLE agents ADD COLUMN user_id TEXT`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
        } else {
          console.error('Migration error:', err.message);
        }
      }
    });

    db.run(`ALTER TABLE skills ADD COLUMN user_id TEXT`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
        } else {
          console.error('Migration error:', err.message);
        }
      }
    });

    db.run(`ALTER TABLE api_configs ADD COLUMN user_id TEXT`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
        } else {
          console.error('Migration error:', err.message);
        }
      }
    });
  });
  
  console.log('Database initialized successfully.');
};
