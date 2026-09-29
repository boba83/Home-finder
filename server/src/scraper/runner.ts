import type { Oglas } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { extractBuildingAreaFromText, extractPlotAreaFromText } from '../domain/areas.js';
import type { Izvor } from '../domain/constants.js';
import { canPossiblyPass, evaluateListing, type PravilaFiltera } from '../domain/filter.js';
import { classifyLocation, isInDetailCheckMunicipality } from '../domain/locations.js';
import { detectPropertyType } from '../domain/propertyType.js';
import { logger } from '../logger.js';
import { notifyNewListings } from '../services/push.js';
import { getSettings, resolveSearches, toRules, type Podesavanja } from '../services/settings.js';
import { BlockedError, fetchHtml, HttpError } from './http.js';
import { SCRAPERI } from './sources/index.js';
import type { IzvorScraper, ParserContext, Pretraga, SiroviOglas } from './types.js';

export interface StatistikaIzvora {
  pregledano: number;
  novih: number;
  odobrenih: number;
  zaProveru: number;
  odbijenih: number;
  vanLokacije: number;
  detaljnihStrana: number;
  greske: string[];
}

export interface RezultatSkeniranja {
  logId: number;
  trajanjeSek: number;
  poIzvoru: Partial<Record<Izvor, StatistikaIzvora>>;
  noviOglasi: Oglas[];
}

type Ishod = { tip: 'poznat' } | { tip: 'van_lokacije' } | { tip: 'sacuvan'; oglas: Oglas };

const DUBOKO_SKENIRANJE_STRANA = 25;
const VIDJENI_CUVAJ_DANA = 90;

let running = false;
let lastProgress: { izvor: Izvor; pretraga: string; strana: number } | null = null;

export const scrapeState = {
  get running() {
    return running;
  },
  get progress() {
    return lastProgress;
  },
};

function emptyStats(): StatistikaIzvora {
  return { pregledano: 0, novih: 0, odobrenih: 0, zaProveru: 0, odbijenih: 0, vanLokacije: 0, detaljnihStrana: 0, greske: [] };
}

async function isKnown(raw: SiroviOglas): Promise<boolean> {
  const [oglas, vidjen] = await Promise.all([
    prisma.oglas.findFirst({ where: { OR: [{ izvor: raw.izvor, izvorId: raw.izvorId }, { link: raw.link }] }, select: { id: true } }),
    prisma.vidjenOglas.findUnique({ where: { izvor_izvorId: { izvor: raw.izvor, izvorId: raw.izvorId } }, select: { id: true } }),
  ]);
  return Boolean(oglas || vidjen);
}

async function markSeen(raw: SiroviOglas) {
  await prisma.vidjenOglas
    .upsert({
      where: { izvor_izvorId: { izvor: raw.izvor, izvorId: raw.izvorId } },
      create: { izvor: raw.izvor, izvorId: raw.izvorId },
      update: {},
    })
    .catch(() => undefined);
}

function mergeDetails(raw: SiroviOglas, details: Partial<SiroviOglas>): SiroviOglas {
  const merged: SiroviOglas = { ...raw };
  for (const [key, value] of Object.entries(details)) {
    if (value !== null && value !== undefined && value !== '') (merged as any)[key] = value;
  }
  return merged;
}

/**
 * Obrada jednog oglasa sa liste:
 * 1. preskoči ako je već u bazi (deduplikacija po ID-u sa sajta i URL-u)
 * 2. klasifikuj lokaciju (Zapadna/Istočna FG) - oglasi van ciljanih mesta se ne čuvaju
 * 3. po potrebi otvori stranicu oglasa (pun opis, površina placa)
 * 4. validiraj po pravilima i sačuvaj sa statusom ODOBREN / ZA_PROVERU / ODBIJEN
 */
async function processListing(
  scraper: IzvorScraper,
  raw: SiroviOglas,
  pretraga: Pretraga,
  listUrl: string,
  rules: PravilaFiltera,
  ctx: ParserContext,
  stats: StatistikaIzvora,
): Promise<Ishod> {
  if (await isKnown(raw)) return { tip: 'poznat' };

  let oglas = raw;
  let tip = detectPropertyType(raw.tipHint ?? pretraga.tip, raw.naslov);
  let lokacija = classifyLocation(raw);
  const mozeDaProdje = canPossiblyPass({ tipNekretnine: tip, cena: raw.cena ?? null }, rules);

  let treba = false;
  if (!lokacija) {
    if (!(mozeDaProdje && scraper.parsirajDetalje && isInDetailCheckMunicipality(raw.lokacija))) {
      await markSeen(raw);
      return { tip: 'van_lokacije' };
    }
    treba = true;
  } else if (mozeDaProdje && scraper.parsirajDetalje && (raw.povrsinaPlaca == null || !raw.opis)) {
    treba = true;
  }

  if (treba && scraper.parsirajDetalje) {
    try {
      const res = await fetchHtml(raw.link, { referer: listUrl });
      stats.detaljnihStrana++;
      oglas = mergeDetails(raw, scraper.parsirajDetalje(res.html, raw, ctx));
    } catch (err) {
      const msg = err instanceof HttpError ? `${err.message} (${err.url})` : String(err);
      logger.warn(`[${scraper.id}] Detalji nisu učitani: ${msg}`);
    }
  }

  if (oglas.povrsinaPlaca == null) {
    oglas.povrsinaPlaca = extractPlotAreaFromText(`${oglas.naslov}. ${oglas.opis ?? ''}`);
  }
  lokacija = lokacija ?? classifyLocation(oglas);
  if (!lokacija) {
    await markSeen(raw);
    return { tip: 'van_lokacije' };
  }

  tip = detectPropertyType(oglas.tipHint ?? pretraga.tip, oglas.naslov);
  const povrsinaObjekta = tip === 'PLAC' ? null : (oglas.povrsinaObjekta ?? extractBuildingAreaFromText(oglas.naslov));
  const cena = oglas.cena ?? null;
  const lokacijaIzOpisa = lokacija.izvorPodatka === 'opis';
  const ocena = evaluateListing(
    { tipNekretnine: tip, cena, povrsinaPlaca: oglas.povrsinaPlaca ?? null, lokacijaIzOpisa, mesto: lokacija.mesto },
    rules,
  );

  try {
    const saved = await prisma.oglas.create({
      data: {
        izvor: oglas.izvor,
        izvorId: oglas.izvorId,
        link: oglas.link,
        naslov: oglas.naslov.slice(0, 300),
        opis: oglas.opis?.slice(0, 5000) ?? null,
        cena,
        tipNekretnine: tip,
        povrsinaObjekta,
        povrsinaPlaca: oglas.povrsinaPlaca ?? null,
        lokacija: oglas.lokacija ?? null,
        mesto: lokacija.mesto,
        grupaLokacije: lokacija.grupa,
        lokacijaIzOpisa,
        slika: oglas.slika ?? null,
        status: ocena.status,
        razlogStatusa: ocena.razlog,
        objavljeno: oglas.objavljeno ?? null,
      },
    });
    return { tip: 'sacuvan', oglas: saved };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { tip: 'poznat' };
    throw err;
  }
}

async function scrapeSource(
  scraper: IzvorScraper,
  settings: Podesavanja,
  maxStrana: number,
  duboko: boolean,
  stats: StatistikaIzvora,
  noviOglasi: Oglas[],
) {
  const rules = toRules(settings);
  const ctx: ParserContext = { kursEurRsd: settings.kursEurRsd };

  for (const pretraga of resolveSearches(scraper.id, settings)) {
    for (let strana = 1; strana <= maxStrana; strana++) {
      lastProgress = { izvor: scraper.id, pretraga: pretraga.naziv, strana };
      const url = scraper.urlStrane(pretraga.url, strana);
      let lista: SiroviOglas[];
      try {
        const res = await fetchHtml(url, { allowStatus: [404] });
        if (res.status === 404) {
          if (strana === 1) stats.greske.push(`${pretraga.naziv}: stranica ne postoji (404)`);
          break;
        }
        lista = scraper.parsirajListu(res.html, pretraga, ctx);
      } catch (err) {
        if (err instanceof BlockedError) {
          stats.greske.push(err.message);
          return;
        }
        const msg = err instanceof HttpError ? `${err.message}` : (err as Error).message;
        stats.greske.push(`${pretraga.naziv} (str. ${strana}): ${msg}`);
        logger.warn(`[${scraper.id}] ${pretraga.naziv} str. ${strana}: ${msg}`);
        break;
      }

      if (lista.length === 0) break;

      let poznatih = 0;
      for (const raw of lista) {
        stats.pregledano++;
        try {
          const ishod = await processListing(scraper, raw, pretraga, url, rules, ctx, stats);
          if (ishod.tip === 'poznat') poznatih++;
          else if (ishod.tip === 'van_lokacije') stats.vanLokacije++;
          else {
            stats.novih++;
            if (ishod.oglas.status === 'ODOBREN') stats.odobrenih++;
            else if (ishod.oglas.status === 'ZA_PROVERU') stats.zaProveru++;
            else stats.odbijenih++;
            noviOglasi.push(ishod.oglas);
            logger.info(`[${scraper.id}] + ${ishod.oglas.status} ${ishod.oglas.tipNekretnine} ${ishod.oglas.mesto} ${ishod.oglas.cena ?? '?'}€ - ${ishod.oglas.naslov}`);
          }
        } catch (err) {
          stats.greske.push(`Obrada oglasa ${raw.link}: ${(err as Error).message}`);
        }
      }

      // Sve na strani je već viđeno -> starije strane su takođe obrađene
      if (!duboko && poznatih === lista.length) break;
    }
  }
}

/**
 * Jedan ciklus skeniranja svih aktivnih izvora. Izvori se obrađuju paralelno
 * (svaki ima sopstveni rate limit), a pretrage unutar izvora sekvencijalno.
 */
export async function runScrape(opts: { duboko?: boolean; izvori?: Izvor[] } = {}): Promise<RezultatSkeniranja | null> {
  if (running) return null;
  running = true;
  const start = Date.now();
  const log = await prisma.skeniranjeLog.create({ data: {} });

  try {
    const settings = await getSettings();
    const prviPut = (await prisma.oglas.count()) === 0;
    const izvori = opts.izvori ?? settings.aktivniIzvori;
    const maxStrana = opts.duboko ? DUBOKO_SKENIRANJE_STRANA : settings.brojStranaPoPretrazi;
    const poIzvoru: Partial<Record<Izvor, StatistikaIzvora>> = {};
    const noviOglasi: Oglas[] = [];

    logger.info(`[scraper] Početak skeniranja (${izvori.join(', ')})${opts.duboko ? ' - DUBOKO' : ''}`);

    await Promise.all(
      izvori.map(async (id) => {
        const stats = (poIzvoru[id] = emptyStats());
        try {
          await scrapeSource(SCRAPERI[id], settings, maxStrana, Boolean(opts.duboko), stats, noviOglasi);
        } catch (err) {
          stats.greske.push((err as Error).message);
          logger.error(`[${id}]`, err);
        }
      }),
    );

    const zaObavestenje = noviOglasi.filter((o) => o.status !== 'ODBIJEN');
    await notifyNewListings(zaObavestenje, { zbirno: prviPut || opts.duboko }).catch((err) =>
      logger.error('[push] Greška pri slanju obaveštenja', err),
    );

    await prisma.vidjenOglas.deleteMany({
      where: { pronadjen: { lt: new Date(Date.now() - VIDJENI_CUVAJ_DANA * 24 * 3600 * 1000) } },
    });

    const total = Object.values(poIzvoru).reduce(
      (acc, s) => ({ pregledano: acc.pregledano + s!.pregledano, odobrenih: acc.odobrenih + s!.odobrenih }),
      { pregledano: 0, odobrenih: 0 },
    );
    const imaGresaka = Object.values(poIzvoru).some((s) => s!.greske.length > 0);

    await prisma.skeniranjeLog.update({
      where: { id: log.id },
      data: {
        kraj: new Date(),
        status: imaGresaka ? 'DELIMICNO' : 'USPESNO',
        pregledano: total.pregledano,
        novih: noviOglasi.length,
        odobrenih: total.odobrenih,
        detalji: JSON.stringify(poIzvoru),
      },
    });

    const trajanjeSek = Math.round((Date.now() - start) / 1000);
    logger.info(`[scraper] Kraj: ${total.pregledano} pregledano, ${noviOglasi.length} novih (${total.odobrenih} odobrenih) za ${trajanjeSek}s`);
    return { logId: log.id, trajanjeSek, poIzvoru, noviOglasi };
  } catch (err) {
    await prisma.skeniranjeLog.update({
      where: { id: log.id },
      data: { kraj: new Date(), status: 'GRESKA', detalji: JSON.stringify({ greska: (err as Error).message }) },
    });
    throw err;
  } finally {
    running = false;
    lastProgress = null;
  }
}

/** Ponovo ocenjuje sve sačuvane oglase po trenutnim pravilima (posle izmene podešavanja). */
export async function reevaluateAll(): Promise<{ promenjeno: number }> {
  const rules = toRules(await getSettings());
  const oglasi = await prisma.oglas.findMany({
    select: {
      id: true,
      tipNekretnine: true,
      cena: true,
      povrsinaPlaca: true,
      lokacijaIzOpisa: true,
      mesto: true,
      status: true,
      razlogStatusa: true,
    },
  });
  let promenjeno = 0;
  for (const o of oglasi) {
    const r = evaluateListing(
      { tipNekretnine: o.tipNekretnine as any, cena: o.cena, povrsinaPlaca: o.povrsinaPlaca, lokacijaIzOpisa: o.lokacijaIzOpisa, mesto: o.mesto },
      rules,
    );
    if (r.status !== o.status || r.razlog !== o.razlogStatusa) {
      await prisma.oglas.update({ where: { id: o.id }, data: { status: r.status, razlogStatusa: r.razlog } });
      if (r.status !== o.status) promenjeno++;
    }
  }
  return { promenjeno };
}
