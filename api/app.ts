/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.ts'
import projectRoutes from './routes/projects.ts'
import settingsRoutes from './routes/settings.ts'
import aiRoutes from './routes/ai.ts'
import agentRoutes from './routes/agents.ts'
import skillRoutes from './routes/skills.ts'

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

const redact = (value: any): any => {
  const sensitiveKeys = new Set(['password', 'api_key', 'authorization', 'token'])
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: any = {}
    Object.entries(value).forEach(([k, v]) => {
      if (sensitiveKeys.has(k.toLowerCase())) out[k] = '[REDACTED]'
      else out[k] = redact(v)
    })
    return out
  }
  return value
}

// Custom Request Logger for full URL and body
app.use((req: Request, res: Response, next: NextFunction) => {
  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  console.log(`[Incoming] ${req.method} ${fullUrl}`, {
    body: redact(req.body),
    query: redact(req.query),
    headers: redact({ authorization: req.headers.authorization })
  });
  next();
});

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/agents', agentRoutes)
app.use('/api/skills', skillRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((_error: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error Handler]', _error);
  const anyErr: any = _error as any
  const status = Number(anyErr?.status || anyErr?.statusCode || 500)
  const message = typeof anyErr?.message === 'string' && anyErr.message.trim() ? anyErr.message : 'Server internal error'
  res.status(status >= 400 && status < 600 ? status : 500).json({
    success: false,
    error: message,
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
