import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import db from '../db/index.ts';

type DbSessionRow = {
  user_id: string;
  token_hash: string;
  expires_at: string;
  email: string;
};

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const dbGet = <T,>(sql: string, params: any[]) =>
  new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as any);
    });
  });

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token) return res.status(401).json({ success: false, error: '未登录' });

    const tokenHash = sha256Hex(token);
    const row = await dbGet<DbSessionRow>(
      `SELECT s.user_id, s.token_hash, s.expires_at, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      [tokenHash]
    );
    if (!row) return res.status(401).json({ success: false, error: '未登录' });

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash], () => {});
      return res.status(401).json({ success: false, error: '登录已过期' });
    }

    req.user = { id: row.user_id, email: row.email };
    next();
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || '鉴权失败' });
  }
};

