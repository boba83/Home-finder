import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { IZVORI } from '../domain/constants.js';
import { logger } from '../logger.js';
import { blockedHosts } from '../scraper/http.js';
import { runScrape, scrapeState } from '../scraper/runner.js';
import { schedulerInfo } from '../services/scheduler.js';

export const scrapeRouter = Router();

scrapeRouter.get('/status', async (_req, res) => {
  const logs = await prisma.skeniranjeLog.findMany({ orderBy: { pocetak: 'desc' }, take: 15 });
  res.json({
    running: scrapeState.running,
    progress: scrapeState.progress,
    blokirani: blockedHosts(),
    ...schedulerInfo(),
    logs: logs.map((l) => ({ ...l, detalji: l.detalji ? JSON.parse(l.detalji) : null })),
  });
});

scrapeRouter.post('/run', async (req, res) => {
  const body = z
    .object({ duboko: z.boolean().optional(), izvori: z.array(z.enum(IZVORI)).optional() })
    .parse(req.body ?? {});
  if (scrapeState.running) {
    res.status(409).json({ error: 'Skeniranje je već u toku' });
    return;
  }
  runScrape(body).catch((err) => logger.error('[scrape] Ručno skeniranje nije uspelo', err));
  res.status(202).json({ started: true });
});
