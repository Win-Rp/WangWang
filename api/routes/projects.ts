import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';

const router = express.Router();

// Get all projects
router.get('/', (req: Request, res: Response) => {
  const sql = 'SELECT * FROM projects ORDER BY updated_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ data: rows });
  });
});

// Get project by ID
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const sql = 'SELECT * FROM projects WHERE id = ?';
  db.get(sql, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ data: row });
  });
});

// Create new project
router.post('/', (req: Request, res: Response) => {
  const { name, canvas_data } = req.body;
  const id = uuidv4();
  const sql = 'INSERT INTO projects (id, name, canvas_data) VALUES (?, ?, ?)';
  
  db.run(sql, [id, name, JSON.stringify(canvas_data || {})], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      message: 'Project created successfully',
      data: { id, name, canvas_data }
    });
  });
});

// Update project
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, canvas_data } = req.body;
  const updatedAt = new Date().toISOString();
  
  let sql = 'UPDATE projects SET updated_at = ?';
  const params = [updatedAt];
  
  if (name) {
    sql += ', name = ?';
    params.push(name);
  }
  
  if (canvas_data) {
    sql += ', canvas_data = ?';
    params.push(JSON.stringify(canvas_data));
  }
  
  sql += ' WHERE id = ?';
  params.push(id);
  
  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({
      message: 'Project updated successfully',
      data: { id, name, canvas_data, updated_at: updatedAt }
    });
  });
});

// Delete project
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const sql = 'DELETE FROM projects WHERE id = ?';
  
  db.run(sql, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ message: 'Project deleted successfully' });
  });
});

export default router;
