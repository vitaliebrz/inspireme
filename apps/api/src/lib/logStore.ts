import { prisma } from './prisma.js';

// ─────────────────────────────────────────────
// PERSISTENȚĂ LOGURI ÎN POSTGRES (istoric pentru producție)
// Scriere batch (nu un insert per log) prin SQL raw — nu depinde de prisma generate.
// Filesystem-ul e efemer în prod; DB-ul păstrează istoricul pentru debugging.
// ─────────────────────────────────────────────

interface Row {
  level: number;
  time: Date;
  msg: string | null;
  reqId: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  code: string | null;
  errType: string | null;
  errMessage: string | null;
  errStack: string | null;
  responseTime: number | null;
  env: string | null;
  raw: string; // JSON stringificat
}

const COLS = [
  'level', 'time', 'msg', 'req_id', 'method', 'path', 'status_code', 'user_id',
  'ip', 'user_agent', 'code', 'err_type', 'err_message', 'err_stack',
  'response_time', 'env', 'raw',
] as const;

const buffer: Row[] = [];
const MAX_BUFFER = 5000;
let flushing = false;

function s(v: unknown): string | null {
  return typeof v === 'string' ? v : v == null ? null : String(v);
}
function n(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Adaugă o linie de log (obiect JSON parsat de pino) în buffer.
export function enqueueLog(o: Record<string, unknown>): void {
  try {
    const req = o['req'] as Record<string, unknown> | undefined;
    const res = o['res'] as Record<string, unknown> | undefined;
    const err = o['err'] as Record<string, unknown> | undefined;
    buffer.push({
      level: n(o['level']) ?? 30,
      time: o['time'] ? new Date(o['time'] as string) : new Date(),
      msg: s(o['msg']),
      reqId: s(o['reqId']),
      method: s(o['method']) ?? s(req?.['method']),
      path: s(o['path']) ?? s(req?.['url']),
      statusCode: n(o['statusCode']) ?? n(res?.['statusCode']),
      userId: s(o['userId']) ?? s(req?.['userId']),
      ip: s(o['ip']) ?? s(req?.['ip']),
      userAgent: s(o['userAgent']) ?? s(req?.['userAgent']),
      code: s(o['code']),
      errType: s(err?.['type']),
      errMessage: s(err?.['message']),
      errStack: s(err?.['stack']),
      responseTime: n(o['responseTime']),
      env: s(o['env']),
      raw: JSON.stringify(o),
    });
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  } catch {
    // nu blocăm logging-ul dacă parsarea eșuează
  }
}

// Scrie în DB tot ce s-a acumulat (batch). Erorile NU se re-logează (evită recursivitatea).
export async function flushLogs(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const rows = buffer.splice(0, buffer.length);
  try {
    const params: unknown[] = [];
    const valuesSql = rows.map((r, ri) => {
      const base = ri * COLS.length;
      const ph = COLS.map((c, ci) => (c === 'raw' ? `$${base + ci + 1}::jsonb` : `$${base + ci + 1}`));
      params.push(
        r.level, r.time, r.msg, r.reqId, r.method, r.path, r.statusCode, r.userId,
        r.ip, r.userAgent, r.code, r.errType, r.errMessage, r.errStack,
        r.responseTime, r.env, r.raw,
      );
      return `(${ph.join(',')})`;
    }).join(',');
    const sql = `INSERT INTO log_entries (${COLS.join(',')}) VALUES ${valuesSql}`;
    await prisma.$executeRawUnsafe(sql, ...params);
  } catch (e) {
    // DB indisponibilă (ex. Neon cold start) — repunem rândurile în buffer și reîncercăm data viitoare
    buffer.unshift(...rows.slice(0, MAX_BUFFER));
    // eslint-disable-next-line no-console
    console.error('[logStore] flush eșuat (se reia):', (e as Error).message);
  } finally {
    flushing = false;
  }
}

// Pornește flush-ul periodic (la fiecare 5s). Apelat o dată la boot.
let started = false;
export function startLogPersistence(): void {
  if (started) return;
  started = true;
  setInterval(() => { void flushLogs(); }, 5000);
}

// Curăță logurile vechi: info/debug > 7 zile, warn/error > 90 zile.
export async function pruneLogs(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM log_entries WHERE (level < 40 AND time < NOW() - INTERVAL '7 days') OR (time < NOW() - INTERVAL '90 days')`,
  );
}
