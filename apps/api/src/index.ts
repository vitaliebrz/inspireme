import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { httpLogger, logger } from './lib/logger.js';
import { startLogPersistence, flushLogs, pruneLogs } from './lib/logStore.js';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import apiRoutes from './routes/index.js';
import { registerSocketHandlers } from './socket/index.js';
import { setIO } from './lib/socket.js';
import { autoSelectExpiredWinners, processGiveawayInvestmentDeadlines } from './services/giveaway.service.js';
import { runInactivityJob } from './services/admin.service.js';
import { recomputeIdeaScores } from './services/feed.service.js';
import { resetInactiveIdeaStatuses } from './services/ideas.service.js';
import { notifyExpiringSubscriptions } from './services/subscriptions.service.js';
import { remindPendingCollaborations } from './services/collaboration.service.js';

const app = express();
const httpServer = createServer(app);

const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
const allowedOrigins = process.env['NODE_ENV'] === 'production'
  ? [frontendUrl]
  : [frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];

// În development permite localhost/LAN (192.168.x.x, 10.x.x.x) pe orice port —
// portul Vite poate diferi de 5173 dacă e deja ocupat de alt proiect pe mașină.
const localNetworkPattern = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+$/;

const validateOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  if (process.env['NODE_ENV'] !== 'production' && localNetworkPattern.test(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin ${origin} not allowed by CORS`));
};

// Socket.io pentru chat real-time
const io = new SocketServer(httpServer, {
  cors: {
    origin: validateOrigin,
    credentials: true,
  },
});

setIO(io);
registerSocketHandlers(io);

// Security headers
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      },
    },
  }),
);

// CORS strict
app.use(
  cors({
    origin: validateOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Logging HTTP structurat — un log per cerere, cu requestId corelabil
app.use(httpLogger);

app.use(cookieParser());
// Webhook-ul Stripe are nevoie de body-ul brut (nealterat) ca să verifice semnătura —
// dacă express.json() rulează înainte pe acea rută, consumă stream-ul și semnătura
// Stripe nu se mai poate verifica niciodată (eșuează mereu cu 400), indiferent de secret.
app.use((req, res, next) => {
  if (req.path === '/api/v1/subscriptions/webhook') { next(); return; }
  express.json({ limit: '1mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting general
app.use(generalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', apiRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env['PORT'] ?? 4000);

// Erorile de conexiune Prisma (Neon serverless în cold start / blip de rețea) sunt
// TRANZITORII — la următoarea rulare a schedulerului reușesc. Le logăm ca warn, nu
// error, ca să nu polueze metricile de erori și să nu pară bug-uri reale.
const TRANSIENT_DB_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
function logSchedulerError(name: string, err: unknown): void {
  const code = (err as { code?: string }).code;
  if (code && TRANSIENT_DB_CODES.has(code)) {
    logger.warn({ job: name, code }, `[Scheduler] ${name}: DB temporar indisponibilă (${code}), se reia la următoarea rulare`);
  } else {
    logger.error({ err }, `[Scheduler] ${name}`);
  }
}

async function bootstrap(): Promise<void> {
  try {
    // Neon se poate afla în cold start — retry de 3 ori
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await prisma.$connect();
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        console.log(`[Prisma] Încercare ${attempt}/3 — Neon pornește...`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    console.log('[Prisma] Conectat la PostgreSQL');

    // Upstash Redis REST — verificare conexiune
    try {
      await redis.ping();
      console.log('[Redis] Upstash conectat');
    } catch {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('Redis indisponibil în producție');
      }
      console.warn('[Redis] Indisponibil — rate limiting dezactivat în development');
    }

    // Keepalive Neon — ping la fiecare 4 minute ca să nu adoarmă
    setInterval(() => {
      prisma.$queryRaw`SELECT 1`.catch(() => {});
    }, 4 * 60 * 1000);

    // Persistență loguri în Postgres (istoric pentru producție) — flush periodic
    startLogPersistence();

    // Recalculează scorurile feed-ului la pornire (ideile existente au scor 0 după migrare)
    recomputeIdeaScores().catch((err) => logSchedulerError('recomputeIdeaScores (boot)', err));

    // Scheduler giveaway — selecție automată câștigători la expirare
    autoSelectExpiredWinners().catch(() => {});
    setInterval(() => {
      autoSelectExpiredWinners().catch((err) => logSchedulerError('autoSelectExpiredWinners', err));
    }, 60_000);

    // Joburi zilnice 02:00 — GDPR + notificări programate (reset stadiu idee,
    // reminder colaborare, expirare abonament, deadline-uri investiție giveaway)
    const runDailyJobs = async () => {
      const jobs: [string, () => Promise<void>][] = [
        ['recomputeIdeaScores', recomputeIdeaScores],
        ['runInactivityJob', runInactivityJob],
        ['resetInactiveIdeaStatuses', resetInactiveIdeaStatuses],
        ['remindPendingCollaborations', remindPendingCollaborations],
        ['notifyExpiringSubscriptions', notifyExpiringSubscriptions],
        ['processGiveawayInvestmentDeadlines', processGiveawayInvestmentDeadlines],
        ['pruneLogs', pruneLogs],
      ];
      for (const [name, job] of jobs) {
        await job().catch((err) => logSchedulerError(name, err));
      }
    };

    const msUntilNext2AM = () => {
      const next = new Date();
      next.setHours(2, 0, 0, 0);
      if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
      return next.getTime() - Date.now();
    };
    setTimeout(function scheduleDailyJobs() {
      void runDailyJobs();
      setInterval(() => void runDailyJobs(), 24 * 60 * 60 * 1000);
    }, msUntilNext2AM());

    httpServer.listen(PORT, () => {
      console.log(`[Server] InspireMe API pornit pe portul ${PORT}`);
      console.log(`[Server] Mediu: ${process.env['NODE_ENV'] ?? 'development'}`);
    });
  } catch (err) {
    logger.error({ err }, '[Server] Nu s-a putut porni');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM primit — oprire graceful...');
  await flushLogs().catch(() => {}); // salvăm ultimele loguri înainte de oprire
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});

bootstrap();
