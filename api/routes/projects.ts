import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = express.Router();

router.use(requireAuth);

// Get all projects
router.get('/', (req: Request, res: Response) => {
  db.all('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC', [req.user!.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// Create new project
router.post('/', (req: Request, res: Response) => {
  const { name, canvas_data } = req.body;
  const id = uuidv4();
  const sql = 'INSERT INTO projects (id, user_id, name, canvas_data) VALUES (?, ?, ?, ?)';
  const params = [id, req.user!.id, name, JSON.stringify(canvas_data)];
  
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ data: { id, name, canvas_data } });
  });
});

// Update project
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, canvas_data } = req.body;
  const sql =
    'UPDATE projects SET name = COALESCE(?, name), canvas_data = COALESCE(?, canvas_data), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?';
  const canvasDataValue = canvas_data === undefined ? null : JSON.stringify(canvas_data);
  const nameValue = name === undefined ? null : name;
  const params = [nameValue, canvasDataValue, id, req.user!.id];
  
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if ((this as any).changes === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project updated successfully' });
  });
});

export default router;
