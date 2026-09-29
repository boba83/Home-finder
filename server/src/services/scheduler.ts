import { logger } from '../logger.js';
import { runScrape, scrapeState } from '../scraper/runner.js';
import { getSettings } from './settings.js';

/** Nasumično odlaganje (0-90s) da zahtevi ne kreću uvek u isto vreme */
const JITTER_MAX_MS = 90_000;
/**
 * Provera na svakih 30s umesto jednog dugog tajmera: posle sna računara tajmeri kasne ili se
 * preskaču, a ovako se propušteno skeniranje pokreće odmah po buđenju.
 */
const CHECK_EVERY_MS = 30_000;

let loop: NodeJS.Timeout | null = null;
let currentInterval: number | null = null;
let nextRunAt: number | null = null;
let aktivno = true;

const jitter = () => Math.floor(Math.random() * JITTER_MAX_MS);

async function check() {
  if (nextRunAt === null || Date.now() < nextRunAt || scrapeState.running) return;
  const settings = await getSettings();
  nextRunAt = Date.now() + settings.intervalMinuta * 60_000 + jitter();
  if (!settings.skeniranjeAktivno) return;
  await runScrape().catch((err) => logger.error('[scheduler] Skeniranje nije uspelo', err));
}

/** (Re)startuje raspored prema intervalu iz podešavanja (npr. svakih 12 minuta). */
export async function startScheduler() {
  const settings = await getSettings();
  const interval = Math.min(59, Math.max(5, settings.intervalMinuta));
  if (loop && currentInterval === interval && aktivno === settings.skeniranjeAktivno) return;

  currentInterval = interval;
  aktivno = settings.skeniranjeAktivno;
  nextRunAt = Date.now() + interval * 60_000 + jitter();
  if (!loop) {
    loop = setInterval(() => {
      check().catch((err) => logger.error('[scheduler]', err));
    }, CHECK_EVERY_MS);
  }
  logger.info(`[scheduler] Skeniranje zakazano na svakih ${interval} min`);
}

export function schedulerInfo() {
  return {
    intervalMinuta: currentInterval,
    sledeceSkeniranje: nextRunAt && aktivno ? new Date(Math.max(nextRunAt, Date.now())) : null,
  };
}
