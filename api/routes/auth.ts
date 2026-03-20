import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.ts';

const router = express.Router();

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_iters: number;
};

const normalizeEmail = (email: string) => String(email || '').trim().toLowerCase();

const pbkdf2Hash = (password: string, saltHex: string, iters: number) => {
  const salt = Buffer.from(saltHex, 'hex');
  const derived = crypto.pbkdf2Sync(password, salt, iters, 32, 'sha256');
  return derived.toString('hex');
};

const hashPassword = (password: string) => {
  const iters = 210_000;
  const saltHex = crypto.randomBytes(16).toString('hex');
  const hashHex = pbkdf2Hash(password, saltHex, iters);
  return { hashHex, saltHex, iters };
};

const verifyPassword = (password: string, row: Pick<UserRow, 'password_hash' | 'password_salt' | 'password_iters'>) => {
  const computed = pbkdf2Hash(password, row.password_salt, Number(row.password_iters));
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(row.password_hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const dbGet = <T,>(sql: string, params: any[]) =>
  new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as any);
    });
  });

const dbRun = (sql: string, params: any[]) =>
  new Promise<{ changes?: number }>((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: (this as any)?.changes });
    });
  });

const claimLegacyDataForUser = async (userId: string) => {
  const tables = ['projects', 'agents', 'skills', 'api_configs'] as const;
  await Promise.all(tables.map((t) => dbRun(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`, [userId]).catch(() => ({ changes: 0 }))));
};

const createSession = async (userId: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await dbRun(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionId, userId, tokenHash, expiresAt]
  );
  return { token, expiresAt };
};

router.post('/register', async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: '邮箱格式不正确' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: '密码至少 6 位' });
  }

  try {
    const existing = await dbGet<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ success: false, error: '该邮箱已注册' });
    }

    const userId = uuidv4();
    const { hashHex, saltHex, iters } = hashPassword(password);

    await dbRun(
      'INSERT INTO users (id, email, password_hash, password_salt, password_iters) VALUES (?, ?, ?, ?, ?)',
      [userId, email, hashHex, saltHex, iters]
    );

    await claimLegacyDataForUser(userId);
    const session = await createSession(userId);

    return res.status(201).json({
      success: true,
      data: {
        token: session.token,
        user: { id: userId, email },
        expires_at: session.expiresAt,
      },
    });
  } catch (err: any) {
    console.error('[Register Error Details]', err);
    return res.status(500).json({ 
      success: false, 
      error: err?.message || '注册过程发生未知错误',
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ success: false, error: '邮箱和密码不能为空' });
  }

  try {
    const user = await dbGet<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ success: false, error: '邮箱或密码错误' });
    }
    if (!verifyPassword(password, user)) {
      return res.status(401).json({ success: false, error: '邮箱或密码错误' });
    }

    await claimLegacyDataForUser(user.id);
    const session = await createSession(user.id);

    return res.json({
      success: true,
      data: {
        token: session.token,
        user: { id: user.id, email: user.email },
        expires_at: session.expiresAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || '登录失败' });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(200).json({ success: true });

  try {
    const tokenHash = sha256Hex(token);
    await dbRun('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(401).json({ success: false, error: '未登录' });

  try {
    const tokenHash = sha256Hex(token);
    const row = await dbGet<{ id: string; email: string; expires_at: string }>(
      `SELECT u.id, u.email, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      [tokenHash]
    );
    if (!row) return res.status(401).json({ success: false, error: '未登录' });
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await dbRun('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]).catch(() => ({ changes: 0 }));
      return res.status(401).json({ success: false, error: '登录已过期' });
    }
    return res.json({ success: true, data: { user: { id: row.id, email: row.email } } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || '获取用户信息失败' });
  }
});

export default router;
