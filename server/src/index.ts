import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { listingsRouter } from './routes/listings.js';
import { pushRouter } from './routes/push.js';
import { scrapeRouter } from './routes/scrape.js';
import { settingsRouter } from './routes/settings.js';
import { runScrape } from './scraper/runner.js';
import { startScheduler } from './services/scheduler.js';
import { getSettings } from './services/settings.js';

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/listings', listingsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/push', pushRouter);
app.use('/api/scrape', scrapeRouter);

// U produkciji (npm run build) server služi i izgrađeni frontend
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Neispravni podaci', details: err.issues });
    return;
  }
  if ((err as any)?.code === 'P2025') {
    res.status(404).json({ error: 'Nije pronađeno' });
    return;
  }
  logger.error('[api]', err);
  res.status(500).json({ error: (err as Error)?.message ?? 'Greška na serveru' });
});

async function main() {
  await getSettings();
  await prisma.skeniranjeLog.updateMany({
    where: { status: 'U_TOKU' },
    data: { status: 'GRESKA', kraj: new Date(), detalji: JSON.stringify({ greska: 'Prekinuto restartom servera' }) },
  });
  app.listen(config.port, () => {
    logger.info(`Home Finder API radi na http://localhost:${config.port}`);
  });
  await startScheduler();
  if (config.scrapeOnStart) {
    setTimeout(() => {
      runScrape().catch((err) => logger.error('[scraper] Početno skeniranje nije uspelo', err));
    }, 3000);
  }
}

main().catch(async (err) => {
  logger.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
