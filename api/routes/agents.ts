import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = express.Router();

router.use(requireAuth);

// Get all agents
router.get('/', (req: Request, res: Response) => {
  db.all('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC', [req.user!.id], (err, rows) => {
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
    'INSERT INTO agents (id, user_id, name, system_prompt) VALUES (?, ?, ?, ?)',
    [id, req.user!.id, name, system_prompt],
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
    'UPDATE agents SET name = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [name, system_prompt, id, req.user!.id],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      if ((this as any).changes === 0) {
        return res.status(404).json({ success: false, error: '智能体不存在' });
      }
      res.json({ success: true, data: { id, name, system_prompt } });
    }
  );
});

// Delete agent
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.run('DELETE FROM agents WHERE id = ? AND user_id = ?', [id, req.user!.id], function (err) {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    if ((this as any).changes === 0) {
      return res.status(404).json({ success: false, error: '智能体不存在' });
    }
    res.json({ success: true, message: '智能体已删除' });
  });
});

export default router;
