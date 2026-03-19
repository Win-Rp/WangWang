import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.ts';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  db.all('SELECT * FROM skills ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

router.post('/', (req: Request, res: Response) => {
  const { name, content } = req.body;
  if (!name || !content) {
    return res.status(400).json({ success: false, error: '名称和内容不能为空' });
  }

  const id = uuidv4();
  db.run(
    'INSERT INTO skills (id, name, content) VALUES (?, ?, ?)',
    [id, name, content],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id, name, content } });
    }
  );
});

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ success: false, error: '名称和内容不能为空' });
  }

  db.run(
    'UPDATE skills SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, content, id],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id, name, content } });
    }
  );
});

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.run('DELETE FROM skills WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, message: '技能已删除' });
  });
});

export default router;

