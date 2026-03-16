import sqlite3 from 'sqlite3';
import path from 'path';

// Enable verbose mode for debugging
const sqlite = sqlite3.verbose();

const dbPath = path.resolve(process.cwd(), 'wangwang.db');

const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

export default db;
