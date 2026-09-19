import { mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import type { Request, Response } from 'express';
import { enqueueLog } from './logStore.js';

// ─────────────────────────────────────────────
// LOGGER STRUCTURAT (pino)
// Scrie simultan în consolă (terminal) și în fișier JSON rotativ-manual
// (logs/app.log). Fișierul e citit de panoul admin /admin/logs.
// ─────────────────────────────────────────────

const LOG_DIR = join(process.cwd(), 'logs');
mkdirSync(LOG_DIR, { recursive: true });

export const LOG_FILE = join(LOG_DIR, 'app.log');

// Stream către fișier (append). Nu blocăm procesul dacă scrierea eșuează.
const fileStream = createWriteStream(LOG_FILE, { flags: 'a' });
fileStream.on('error', () => { /* nu oprim serverul dacă logul de fișier pică */ });

export const logger = pino(
  {
    level: process.env['LOG_LEVEL'] ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { env: process.env['NODE_ENV'] ?? 'development' }, // fără pid/hostname; păstrăm mediul
    serializers: { err: pino.stdSerializers.err },
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: fileStream },
    // Stream care persistă logurile în Postgres (istoric pentru producție)
    { stream: { write: (line: string) => { try { enqueueLog(JSON.parse(line)); } catch { /* ignoră linii ne-JSON */ } } } },
  ]),
);

// Câmpuri sensibile care NU trebuie logate niciodată din body/headers
const REDACT = new Set(['password', 'confirmPassword', 'token', 'refreshToken', 'authorization']);

function safeUrl(url?: string): string {
  if (!url) return '';
  // Nu logăm query strings cu potențiale date sensibile
  return url.split('?')[0] ?? url;
}

// Middleware HTTP — un log per cerere, cu requestId corelabil.
export const httpLogger = pinoHttp({
  logger,
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  // Nivelul logului în funcție de status: 5xx→error, 4xx→warn, restul→info
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Adăugăm userId (dacă middleware-ul de auth a rulat până la finalul cererii)
  customProps: (req) => {
    const u = (req as Request & { user?: { sub?: string; role?: string } }).user;
    return { userId: u?.sub ?? null, role: u?.role ?? null };
  },
  customSuccessMessage: (req, res) => `${req.method} ${safeUrl(req.url)} → ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${safeUrl(req.url)} → ${res.statusCode}`,
  serializers: {
    // Detalii îmbogățite per cerere (stil Kibana): IP, user-agent, host, protocol...
    req: (req) => {
      const r = req as unknown as {
        method?: string; url?: string; query?: unknown;
        headers?: Record<string, string | undefined>;
        remoteAddress?: string;
        raw?: { httpVersion?: string };
      };
      const h = r.headers ?? {};
      return {
        method: r.method,
        url: safeUrl(r.url),
        query: redactBody(r.query),
        ip: h['x-forwarded-for']?.split(',')[0]?.trim() ?? r.remoteAddress ?? null,
        userAgent: h['user-agent'] ?? null,
        referer: h['referer'] ?? h['referrer'] ?? null,
        host: h['host'] ?? null,
        httpVersion: r.raw?.httpVersion ?? null,
      };
    },
    res: (res) => {
      const r = res as unknown as { statusCode?: number; getHeader?: (n: string) => unknown };
      return {
        statusCode: r.statusCode,
        bytes: Number(r.getHeader?.('content-length')) || undefined,
      };
    },
  },
  // Nu inundăm logurile cu health-check-uri
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/api/v1/health',
  },
});

// Redactează un obiect body pentru logare (elimină câmpurile sensibile).
export function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = REDACT.has(k.toLowerCase()) ? '[redacted]' : v;
  }
  return out;
}

// Logger legat de o cerere (include reqId). Fallback la logger-ul global.
export function reqLogger(req: Request) {
  return (req as Request & { log?: typeof logger }).log ?? logger;
}

export function getReqId(req: Request | Response): string | undefined {
  return (req as unknown as { id?: string }).id;
}
