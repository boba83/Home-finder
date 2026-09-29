import webpush from 'web-push';
import type { Oglas, PushPretplata } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { IZVOR_NAZIV, GRUPA_NAZIV, type GrupaLokacije, type Izvor } from '../domain/constants.js';
import { logger } from '../logger.js';

export const pushEnabled = Boolean(config.vapid.publicKey && config.vapid.privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
} else {
  logger.warn('[push] VAPID ključevi nisu podešeni - push notifikacije su isključene. Pokrenite: npm run vapid');
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  image?: string | null;
  tag?: string;
}

const TIP_NAZIV: Record<string, string> = { PLAC: 'Plac', KUCA: 'Kuća', VIKENDICA: 'Vikendica' };

function parseList(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function send(sub: PushPretplata, payload: PushPayload): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 },
    );
    return true;
  } catch (err: any) {
    // 404/410 = pretplata više ne postoji (korisnik je ugasio notifikacije ili obrisao browser podatke)
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await prisma.pushPretplata.delete({ where: { id: sub.id } }).catch(() => undefined);
      logger.info(`[push] Uklonjena istekla pretplata ${sub.id}`);
    } else {
      logger.warn(`[push] Slanje nije uspelo (${err?.statusCode ?? err?.message})`);
    }
    return false;
  }
}

export function formatListingNotification(o: Oglas): PushPayload {
  const cena = o.cena ? `${Math.round(o.cena).toLocaleString('de-DE')} €` : 'cena na upit';
  const plac = o.povrsinaPlaca ? ` • plac ${(o.povrsinaPlaca / 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} a` : '';
  const prefix = o.status === 'ZA_PROVERU' ? '[Za proveru] ' : '';
  return {
    title: `${prefix}${TIP_NAZIV[o.tipNekretnine] ?? 'Oglas'} • ${o.mesto ?? o.lokacija ?? ''} • ${cena}`,
    body: `${o.naslov}${plac}\n${GRUPA_NAZIV[o.grupaLokacije as GrupaLokacije] ?? ''} • ${IZVOR_NAZIV[o.izvor as Izvor] ?? o.izvor}`,
    url: o.link,
    image: o.slika,
    tag: `oglas-${o.id}`,
  };
}

/**
 * Šalje obaveštenja o novim oglasima svakoj pretplati prema njenim izabranim grupama i kategorijama.
 * Ako za jednu pretplatu ima više od `maxPojedinacnih` oglasa, šalje se jedno zbirno obaveštenje.
 */
export async function notifyNewListings(oglasi: Oglas[], opts: { zbirno?: boolean; maxPojedinacnih?: number } = {}) {
  if (!pushEnabled || oglasi.length === 0) return;
  const maxPojedinacnih = opts.maxPojedinacnih ?? 4;
  const subs = await prisma.pushPretplata.findMany();

  for (const sub of subs) {
    const grupe = parseList(sub.grupe);
    const kategorije = parseList(sub.kategorije);
    const matching = oglasi.filter(
      (o) =>
        grupe.includes(o.grupaLokacije) &&
        kategorije.includes(o.tipNekretnine) &&
        (o.status === 'ODOBREN' || (o.status === 'ZA_PROVERU' && sub.zaProveru)),
    );
    if (matching.length === 0) continue;

    if (opts.zbirno || matching.length > maxPojedinacnih) {
      const odobrenih = matching.filter((o) => o.status === 'ODOBREN').length;
      await send(sub, {
        title: `Home Finder: ${matching.length} novih oglasa`,
        body: `${odobrenih} odgovara kriterijumima${matching.length > odobrenih ? `, ${matching.length - odobrenih} za proveru` : ''}. Otvorite dashboard za pregled.`,
        url: '/',
        tag: 'zbirno',
      });
    } else {
      for (const o of matching) await send(sub, formatListingNotification(o));
    }
  }

  await prisma.oglas.updateMany({ where: { id: { in: oglasi.map((o) => o.id) } }, data: { obavesteno: true } });
}

export async function sendTestNotification(endpoint?: string) {
  if (!pushEnabled) throw new Error('Push nije podešen (nedostaju VAPID ključevi)');
  const subs = await prisma.pushPretplata.findMany(endpoint ? { where: { endpoint } } : undefined);
  let sent = 0;
  for (const sub of subs) {
    if (await send(sub, { title: 'Home Finder', body: 'Test obaveštenje radi. Bićete obavešteni o novim oglasima.', url: '/', tag: 'test' })) sent++;
  }
  return sent;
}
