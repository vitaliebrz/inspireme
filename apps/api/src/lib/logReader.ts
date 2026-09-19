import { prisma } from './prisma.js';

// ─────────────────────────────────────────────
// CITITOR DE LOGURI — pentru panoul admin /admin/logs
// Citește din tabelul persistent `log_entries` (Postgres) prin SQL raw.
// Istoricul supraviețuiește restart-urilor (filesystem-ul e efemer în prod).
// ─────────────────────────────────────────────

const LEVEL_NAME: Record<number, string> = {
  10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal',
};

export interface LogEntry {
  level: string;
  levelNum: number;
  time: string;
  msg: string;
  reqId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  userId?: string | null;
  role?: string | null;
  code?: string;
  // Detalii îmbogățite (stil Kibana)
  ip?: string | null;
  userAgent?: string | null;
  referer?: string | null;
  host?: string | null;
  httpVersion?: string | null;
  responseTime?: number;
  bytes?: number;
  env?: string;
  query?: unknown;
  body?: unknown;
  err?: { type?: string; message?: string; stack?: string };
  raw: Record<string, unknown>;
}

// Rând brut din tabelul log_entries (coloane aliasate la camelCase în SELECT)
interface RawRow {
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
  raw: Record<string, unknown> | null;
}

const SELECT_COLS = `
  level, time, msg, req_id AS "reqId", method, path, status_code AS "statusCode",
  user_id AS "userId", ip, user_agent AS "userAgent", code, err_type AS "errType",
  err_message AS "errMessage", err_stack AS "errStack", response_time AS "responseTime",
  env, raw`;

function rowToEntry(r: RawRow): LogEntry {
  const levelNum = r.level ?? 30;
  const raw = (r.raw ?? {}) as Record<string, unknown>;
  const req = raw['req'] as Record<string, unknown> | undefined;
  const res = raw['res'] as Record<string, unknown> | undefined;
  return {
    level: LEVEL_NAME[levelNum] ?? 'info',
    levelNum,
    time: r.time instanceof Date ? r.time.toISOString() : String(r.time),
    msg: r.msg ?? '',
    reqId: r.reqId ?? undefined,
    method: r.method ?? undefined,
    path: r.path ?? undefined,
    statusCode: r.statusCode ?? undefined,
    userId: r.userId ?? null,
    role: (raw['role'] as string | null | undefined) ?? null,
    code: r.code ?? undefined,
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
    referer: (req?.['referer'] as string | null | undefined) ?? null,
    host: (req?.['host'] as string | null | undefined) ?? null,
    httpVersion: (req?.['httpVersion'] as string | null | undefined) ?? null,
    responseTime: r.responseTime ?? undefined,
    bytes: res?.['bytes'] as number | undefined,
    env: r.env ?? undefined,
    query: req?.['query'],
    body: raw['body'],
    err: (r.errType || r.errMessage || r.errStack)
      ? { type: r.errType ?? undefined, message: r.errMessage ?? undefined, stack: r.errStack ?? undefined }
      : (raw['err'] as LogEntry['err']),
    raw,
  };
}

const LEVEL_MIN: Record<string, number> = { all: 0, info: 30, warn: 40, error: 50 };

export interface LogQuery {
  level?: 'all' | 'info' | 'warn' | 'error';
  search?: string;
  limit?: number;
}

// Logurile cele mai recente (newest-first), filtrate.
export async function readLogEntries(q: LogQuery = {}): Promise<LogEntry[]> {
  const min = LEVEL_MIN[q.level ?? 'all'] ?? 0;
  const limit = Math.min(q.limit ?? 200, 1000);
  const params: unknown[] = [min];
  let where = 'level >= $1';
  const search = q.search?.trim();
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (msg ILIKE $2 OR path ILIKE $2 OR req_id ILIKE $2 OR err_message ILIKE $2 OR user_id ILIKE $2)`;
  }
  params.push(limit);
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT ${SELECT_COLS} FROM log_entries WHERE ${where} ORDER BY time DESC LIMIT $${params.length}`,
    ...params,
  );
  return rows.map(rowToEntry);
}

// Toate liniile unei singure cereri (fluxul complet), în ordine cronologică.
export async function readLogFlow(reqId: string): Promise<LogEntry[]> {
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT ${SELECT_COLS} FROM log_entries WHERE req_id = $1 ORDER BY time ASC LIMIT 500`,
    reqId,
  );
  return rows.map(rowToEntry);
}

// Număr de erori NEVĂZUTE pentru badge: erorile din ultimele 24h care sunt mai noi
// decât `sinceDate` (momentul în care adminul a deschis ultima dată pagina de loguri).
// Fără sinceDate → toate erorile din ultimele 24h. Fereastra e mereu limitată la 24h.
export async function countRecentErrors(sinceDate?: Date): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoff = sinceDate && sinceDate > dayAgo ? sinceDate : dayAgo;
  const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*)::int AS count FROM log_entries WHERE level >= 50 AND time >= $1`,
    cutoff,
  );
  return Number(rows[0]?.count ?? 0);
}

// ─────────────────────────────────────────────
// METRICI AGREGATE (dashboard stil Grafana)
// ─────────────────────────────────────────────

export interface LogStats {
  from: string;
  to: string;
  bucketMs: number;
  totalLogs: number;
  totalRequests: number;
  errorCount: number;
  warnCount: number;
  errorResponses: number;
  errorRate: number;
  avgResponseTime: number | null;
  p95ResponseTime: number | null;
  p99ResponseTime: number | null;
  series: { t: string; info: number; warn: number; error: number; requests: number; avgMs: number | null }[];
  statusClasses: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  topRoutes: { path: string; count: number; errors: number; avgMs: number | null }[];
  topErrors: { msg: string; count: number; lastSeen: string; path: string | null }[];
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? null;
}

// Agregă logurile din ultima fereastră de timp în metrici pentru dashboard.
export async function getLogStats(windowMs = 24 * 60 * 60 * 1000): Promise<LogStats> {
  const now = Date.now();
  const cutoff = new Date(now - windowMs);
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT ${SELECT_COLS} FROM log_entries WHERE time >= $1 ORDER BY time ASC LIMIT 50000`,
    cutoff,
  );
  const entries = rows.map(rowToEntry);

  const BUCKETS = 32;
  const bucketMs = Math.max(60_000, Math.floor(windowMs / BUCKETS));
  const start = now - windowMs;

  const series = Array.from({ length: BUCKETS }, (_, i) => ({
    t: new Date(start + i * bucketMs).toISOString(),
    info: 0, warn: 0, error: 0, requests: 0,
    _msSum: 0, _msN: 0, avgMs: null as number | null,
  }));

  const statusClasses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  const routeMap = new Map<string, { count: number; errors: number; msSum: number; msN: number }>();
  const errorMap = new Map<string, { count: number; lastSeen: string; path: string | null }>();
  const allTimes: number[] = [];
  let totalRequests = 0, errorCount = 0, warnCount = 0, errorResponses = 0;

  for (const e of entries) {
    const bi = Math.min(BUCKETS - 1, Math.max(0, Math.floor((new Date(e.time).getTime() - start) / bucketMs)));
    const bucket = series[bi]!;
    if (e.levelNum >= 50) { bucket.error++; errorCount++; }
    else if (e.levelNum === 40) { bucket.warn++; warnCount++; }
    else { bucket.info++; }

    const isRequest = typeof e.statusCode === 'number';
    if (isRequest) {
      totalRequests++;
      bucket.requests++;
      const cls = e.statusCode! >= 500 ? '5xx' : e.statusCode! >= 400 ? '4xx' : e.statusCode! >= 300 ? '3xx' : '2xx';
      statusClasses[cls]++;
      if (e.statusCode! >= 500) errorResponses++;

      if (typeof e.responseTime === 'number') {
        allTimes.push(e.responseTime);
        bucket._msSum += e.responseTime;
        bucket._msN++;
      }
      const path = e.path ?? '(necunoscut)';
      const r = routeMap.get(path) ?? { count: 0, errors: 0, msSum: 0, msN: 0 };
      r.count++;
      if (e.statusCode! >= 500) r.errors++;
      if (typeof e.responseTime === 'number') { r.msSum += e.responseTime; r.msN++; }
      routeMap.set(path, r);
    }

    if (e.levelNum >= 50) {
      const key = e.err?.message ?? e.msg ?? '(fără mesaj)';
      const ex = errorMap.get(key) ?? { count: 0, lastSeen: e.time, path: e.path ?? null };
      ex.count++;
      if (e.time > ex.lastSeen) ex.lastSeen = e.time;
      errorMap.set(key, ex);
    }
  }

  for (const b of series) {
    b.avgMs = b._msN > 0 ? Math.round(b._msSum / b._msN) : null;
  }
  const sortedTimes = allTimes.sort((a, b) => a - b);

  const topRoutes = [...routeMap.entries()]
    .map(([path, r]) => ({ path, count: r.count, errors: r.errors, avgMs: r.msN > 0 ? Math.round(r.msSum / r.msN) : null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topErrors = [...errorMap.entries()]
    .map(([msg, e]) => ({ msg, count: e.count, lastSeen: e.lastSeen, path: e.path }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    from: new Date(start).toISOString(),
    to: new Date(now).toISOString(),
    bucketMs,
    totalLogs: entries.length,
    totalRequests,
    errorCount,
    warnCount,
    errorResponses,
    errorRate: totalRequests > 0 ? errorResponses / totalRequests : 0,
    avgResponseTime: sortedTimes.length ? Math.round(sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length) : null,
    p95ResponseTime: percentile(sortedTimes, 95),
    p99ResponseTime: percentile(sortedTimes, 99),
    series: series.map(({ _msSum, _msN, ...rest }) => { void _msSum; void _msN; return rest; }),
    statusClasses,
    topRoutes,
    topErrors,
  };
}
