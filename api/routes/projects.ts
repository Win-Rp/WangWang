import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.ts';

const router = express.Router();

// Get all projects
router.get('/', (req: Request, res: Response) => {
  db.all('SELECT * FROM projects ORDER BY updated_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// Create new project
router.post('/', (req: Request, res: Response) => {
  const { name, canvas_data } = req.body;
  const id = uuidv4();
  const sql = 'INSERT INTO projects (id, name, canvas_data) VALUES (?, ?, ?)';
  const params = [id, name, JSON.stringify(canvas_data)];
  
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ data: { id, name, canvas_data } });
  });
});

// Update project
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, canvas_data } = req.body;
  const sql = 'UPDATE projects SET name = ?, canvas_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  const params = [name, JSON.stringify(canvas_data), id];
  
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Project updated successfully' });
  });
});

export default router;
