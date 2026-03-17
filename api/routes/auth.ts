import express, { type Request, type Response } from 'express';

const router = express.Router();

// Mock auth
router.post('/login', (req: Request, res: Response) => {
  res.json({ token: 'mock-token' });
});

export default router;
