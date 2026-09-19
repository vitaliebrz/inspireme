import { Request, Response, NextFunction } from 'express';
import { reqLogger, redactBody } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const log = reqLogger(req);
  const fwd = req.headers['x-forwarded-for'];
  // Context comun pentru corelarea erorii cu cererea (reqId vine din pino-http)
  const ctx = {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    body: redactBody(req.body),
    userId: (req as Request & { user?: { sub?: string } }).user?.sub ?? null,
    ip: (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) ?? req.socket?.remoteAddress ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };

  if (err instanceof AppError) {
    // Erorile „așteptate" (4xx) se logează ca warn — utile pentru a vedea fluxul,
    // dar nu sunt bug-uri de server.
    log.warn({ ...ctx, statusCode: err.statusCode, code: err.code, msg: err.message }, `AppError: ${err.message}`);
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  // Multer errors
  if (err.name === 'MulterError') {
    const code = (err as Error & { code?: string }).code;
    const msg =
      code === 'LIMIT_FILE_SIZE'  ? 'Fișierul depășește limita permisă.' :
      code === 'LIMIT_FILE_COUNT' ? 'Prea multe fișiere trimise.' :
      code === 'LIMIT_UNEXPECTED_FILE' ? 'Câmp de fișier neașteptat.' :
      err.message;
    log.warn({ ...ctx, statusCode: 400, code }, `MulterError: ${msg}`);
    res.status(400).json({ error: msg });
    return;
  }
  // Erori din fileFilter (format nesuportat, etc.)
  if (err.message.includes('permise') || err.message.includes('nesuportat') || err.message.includes('Format')) {
    log.warn({ ...ctx, statusCode: 400 }, err.message);
    res.status(400).json({ error: err.message });
    return;
  }

  // Eroare neașteptată (5xx) — logăm cu stack complet
  log.error({ ...ctx, err }, `Eroare internă: ${err.message}`);
  res.status(500).json({ error: 'Eroare internă de server' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta nu a fost găsită' });
}
