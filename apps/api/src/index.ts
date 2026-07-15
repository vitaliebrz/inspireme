import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';

import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
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

// În development permite și adrese LAN (192.168.x.x, 10.x.x.x) pe portul 5173
const localNetworkPattern = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):5173$/;

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

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting general
app.use(generalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', apiRoutes);

// Stripe webhooks necesită body raw (înaintea parsării JSON)
// Montat separat în routes/subscriptions.ts cu express.raw()

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env['PORT'] ?? 4000);

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

    // Recalculează scorurile feed-ului la pornire (ideile existente au scor 0 după migrare)
    recomputeIdeaScores().catch((err) => console.error('[Scheduler] recomputeIdeaScores (boot):', err));

    // Scheduler giveaway — selecție automată câștigători la expirare
    autoSelectExpiredWinners().catch(() => {});
    setInterval(() => {
      autoSelectExpiredWinners().catch((err) =>
        console.error('[Scheduler] autoSelectExpiredWinners:', err),
      );
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
      ];
      for (const [name, job] of jobs) {
        await job().catch((err) => console.error(`[Scheduler] ${name}:`, err));
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
    console.error('[Server] Nu s-a putut porni:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM primit — oprire graceful...');
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});

bootstrap();
