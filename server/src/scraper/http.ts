import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

/**
 * Sajtovi sa jačom anti-bot zaštitom dobijaju duže pauze (množilac osnovne pauze iz .env).
 * Nekretnine.rs koristi DataDome koji blokira IP posle serije brzih zahteva.
 */
const HOST_DELAY_MULTIPLIER: Record<string, number> = {
  'www.nekretnine.rs': 3,
  'www.halooglasi.com': 1.5,
};

/** Koliko dugo se sajt ne dira posle anti-bot blokade (duplira se pri ponovljenoj blokadi, max 12h) */
const BLOCK_COOLDOWN_MS = 60 * 60 * 1000;
const BLOCK_COOLDOWN_MAX_MS = 12 * 60 * 60 * 1000;

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly url: string,
  ) {
    super(message);
  }
}

/** Sajt je vratio anti-bot stranicu (captcha / JS challenge) - ne ponavljamo zahteve dok ne prođe pauza. */
export class BlockedError extends HttpError {
  constructor(
    url: string,
    public readonly until: Date,
  ) {
    super(`Sajt je privremeno blokirao pristup (anti-bot zaštita). Sledeći pokušaj posle ${until.toLocaleTimeString('sr-RS')}`, 403, url);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomBetween = (min: number, max: number) => Math.floor(min + Math.random() * Math.max(0, max - min));

interface HostState {
  queue: Promise<void>;
  lastRequestAt?: number;
  cookies: Map<string, string>;
  blockedUntil?: number;
  blockCount: number;
  userAgent: string;
}

const hosts = new Map<string, HostState>();

/** Blokade se čuvaju na disku da restart servera ne bi odmah ponovo "udario" u blokiran sajt */
const BLOCKS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.scraper-blocks.json');

function loadBlocks(): Record<string, { blockedUntil: number; blockCount: number }> {
  try {
    return JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveBlocks() {
  const data = Object.fromEntries(
    [...hosts.entries()].filter(([, s]) => s.blockCount > 0).map(([h, s]) => [h, { blockedUntil: s.blockedUntil ?? 0, blockCount: s.blockCount }]),
  );
  try {
    fs.writeFileSync(BLOCKS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.warn('[http] Ne mogu da sačuvam stanje blokada', err);
  }
}

const savedBlocks = loadBlocks();

function hostState(host: string): HostState {
  let s = hosts.get(host);
  if (!s) {
    const saved = savedBlocks[host];
    // Jedan User-Agent po sajtu tokom sesije - promena UA uz iste kolačiće izgleda sumnjivo
    s = {
      queue: Promise.resolve(),
      cookies: new Map(),
      blockedUntil: saved?.blockedUntil,
      blockCount: saved?.blockCount ?? 0,
      userAgent: USER_AGENTS[randomBetween(0, USER_AGENTS.length)],
    };
    hosts.set(host, s);
  }
  return s;
}

for (const host of Object.keys(savedBlocks)) hostState(host);

export function blockedHosts(): Array<{ host: string; until: Date }> {
  const now = Date.now();
  return [...hosts.entries()]
    .filter(([, s]) => s.blockedUntil && s.blockedUntil > now)
    .map(([host, s]) => ({ host, until: new Date(s.blockedUntil!) }));
}

export function isHostBlocked(url: string): Date | null {
  const s = hosts.get(new URL(url).host);
  return s?.blockedUntil && s.blockedUntil > Date.now() ? new Date(s.blockedUntil) : null;
}

/**
 * Rate limiter po domenu: zahtevi ka istom sajtu idu strogo jedan po jedan,
 * sa nasumičnom pauzom (SCRAPER_MIN_DELAY_MS - SCRAPER_MAX_DELAY_MS) između njih.
 * Različiti sajtovi se obrađuju paralelno.
 */
async function throttled<T>(host: string, task: (state: HostState) => Promise<T>): Promise<T> {
  const state = hostState(host);
  const previous = state.queue;
  let release!: () => void;
  state.queue = new Promise<void>((r) => (release = r));

  await previous;
  try {
    if (state.lastRequestAt !== undefined) {
      const mult = HOST_DELAY_MULTIPLIER[host] ?? 1;
      const pause = randomBetween(config.scraper.minDelayMs * mult, config.scraper.maxDelayMs * mult);
      const wait = pause - (Date.now() - state.lastRequestAt);
      if (wait > 0) await sleep(wait);
    }
    return await task(state);
  } finally {
    state.lastRequestAt = Date.now();
    release();
  }
}

/**
 * Zaglavlja kao kod pravog browsera. `Host` MORA biti prvo zaglavlje: Cloudflare odbija (403)
 * zahteve kod kojih je Host na kraju, što je podrazumevano ponašanje Node-a.
 */
function browserHeaders(url: URL, state: HostState, referer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Host: url.host,
    'User-Agent': state.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'sr-RS,sr;q=0.9,en-US;q=0.7,en;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
  };
  if (referer) headers.Referer = referer;
  if (state.cookies.size > 0) {
    headers.Cookie = [...state.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  return headers;
}

function storeCookies(state: HostState, res: AxiosResponse) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return;
  for (const c of setCookie) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) state.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function isAntiBotPage(res: AxiosResponse): boolean {
  if (res.status !== 403 && res.status !== 429 && res.status !== 503) return false;
  const body = typeof res.data === 'string' ? res.data.slice(0, 3000) : '';
  return (
    Boolean(res.headers['x-datadome']) ||
    res.headers['cf-mitigated'] === 'challenge' ||
    /captcha-delivery\.com|cf-chl|challenge-platform|Please enable JS/i.test(body)
  );
}

function markBlocked(host: string, state: HostState): Date {
  state.blockCount++;
  const cooldown = Math.min(BLOCK_COOLDOWN_MS * 2 ** (state.blockCount - 1), BLOCK_COOLDOWN_MAX_MS);
  state.blockedUntil = Date.now() + cooldown;
  state.cookies.clear();
  saveBlocks();
  logger.warn(`[http] ${host} je aktivirao anti-bot zaštitu - pauza ${Math.round(cooldown / 60000)} min`);
  return new Date(state.blockedUntil);
}

export interface FetchOptions {
  referer?: string;
  /** Statusi koji ne treba da bacaju grešku (npr. 404 kada strana ne postoji) */
  allowStatus?: number[];
}

export interface FetchResult {
  status: number;
  html: string;
  url: string;
}

/**
 * Preuzima HTML stranicu uz rate limiting, kolačiće po sajtu i ponovne pokušaje
 * sa eksponencijalnim čekanjem (429, 5xx, mrežne greške). Anti-bot blokade se ne ponavljaju.
 */
export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const parsed = new URL(url);
  const host = parsed.host;
  let attempt = 0;

  while (true) {
    attempt++;
    const blocked = isHostBlocked(url);
    if (blocked) throw new BlockedError(url, blocked);

    try {
      return await throttled(host, async (state) => {
        const res = await axios.get<string>(url, {
          headers: browserHeaders(parsed, state, opts.referer),
          timeout: config.scraper.timeoutMs,
          responseType: 'text',
          maxRedirects: 5,
          validateStatus: () => true,
          decompress: true,
        });
        storeCookies(state, res);

        if (res.status >= 200 && res.status < 300) {
          if (state.blockCount > 0) {
            state.blockCount = 0;
            saveBlocks();
          }
          return { status: res.status, html: res.data, url: res.request?.res?.responseUrl ?? url };
        }
        if (isAntiBotPage(res)) throw new BlockedError(url, markBlocked(host, state));
        if (opts.allowStatus?.includes(res.status)) {
          return { status: res.status, html: typeof res.data === 'string' ? res.data : '', url };
        }
        throw new HttpError(`HTTP ${res.status}`, res.status, url);
      });
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      const status = err instanceof HttpError ? err.status : null;
      const retryable = status === null || status === 429 || status === 403 || status === 408 || (status >= 500 && status < 600);
      if (!retryable || attempt > config.scraper.maxRetries) {
        const message = err instanceof HttpError ? err.message : (err as AxiosError).message;
        throw new HttpError(message, status, url);
      }
      const base = status === 429 || status === 403 ? 30_000 : 5_000;
      const backoff = base * 2 ** (attempt - 1) + randomBetween(0, 3000);
      logger.warn(`[http] ${host} ${status ?? 'mrežna greška'} - pokušaj ${attempt}/${config.scraper.maxRetries}, čekam ${Math.round(backoff / 1000)}s`);
      await sleep(backoff);
    }
  }
}
