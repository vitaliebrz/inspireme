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
  if (err.name === 'MulterError') {
    const code = (err as Error & { code?: string }).code;
    const msg =
      code === 'LIMIT_FILE_SIZE'  ? 'Fișierul este prea mare. Maxim permis: 10MB.' :
      code === 'LIMIT_FILE_COUNT' ? 'Prea multe fișiere trimise.' :
      code === 'LIMIT_UNEXPECTED_FILE' ? 'Câmp de fișier neașteptat.' :
      err.message;
    res.status(400).json({ error: msg });
    return;
  }
  // Erori din fileFilter (format nesuportat, etc.)
  if (err.message.includes('permise') || err.message.includes('nesuportat') || err.message.includes('Format')) {
    res.status(400).json({ error: err.message });
    return;
  }

  console.error('[Error]', err);
  res.status(500).json({ error: 'Eroare internă de server' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta nu a fost găsită' });
}
