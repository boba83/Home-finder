import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' ? v : fallback;
}

export const config = {
  port: num('PORT', 4817),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5817',
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@localhost',
  },
  scraper: {
    minDelayMs: num('SCRAPER_MIN_DELAY_MS', 4000),
    maxDelayMs: num('SCRAPER_MAX_DELAY_MS', 9000),
    maxRetries: num('SCRAPER_MAX_RETRIES', 3),
    timeoutMs: num('SCRAPER_TIMEOUT_MS', 30000),
  },
  scrapeOnStart: (process.env.SCRAPE_ON_START ?? 'true') === 'true',
  clientDist: path.resolve(SERVER_ROOT, '..', 'client', 'dist'),
};
