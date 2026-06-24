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

const app = express();
const httpServer = createServer(app);

// Socket.io pentru chat real-time
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    credentials: true,
  },
});

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
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
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
