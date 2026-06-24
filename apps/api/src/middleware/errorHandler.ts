import { Request, Response, NextFunction } from 'express';

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
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  // Multer errors
  if (err.name === 'MulterError' || err.message.includes('permise')) {
    res.status(400).json({ error: err.message });
    return;
  }

  console.error('[Error]', err);
  res.status(500).json({ error: 'Eroare internă de server' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta nu a fost găsită' });
}
