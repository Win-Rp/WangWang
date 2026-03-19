import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.ts';

const router = express.Router();

// Get all agents
router.get('/', (req: Request, res: Response) => {
  db.all('SELECT * FROM agents ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

// Create agent
router.post('/', (req: Request, res: Response) => {
  const { name, system_prompt } = req.body;
  if (!name || !system_prompt) {
    return res.status(400).json({ success: false, error: '名称和系统提示词不能为空' });
  }

  const id = uuidv4();
  db.run(
    'INSERT INTO agents (id, name, system_prompt) VALUES (?, ?, ?)',
    [id, name, system_prompt],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id, name, system_prompt } });
    }
  );
});

// Update agent
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, system_prompt } = req.body;

  if (!name || !system_prompt) {
    return res.status(400).json({ success: false, error: '名称和系统提示词不能为空' });
  }

  db.run(
    'UPDATE agents SET name = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, system_prompt, id],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id, name, system_prompt } });
    }
  );
});

// Delete agent
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.run('DELETE FROM agents WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, message: '智能体已删除' });
  });
});

export default router;
