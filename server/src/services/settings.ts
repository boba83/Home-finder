import { z } from 'zod';
import type { Podesavanja as PodesavanjaRow } from '@prisma/client';
import { prisma } from '../db.js';
import { IZVORI, TIPOVI, type Izvor } from '../domain/constants.js';
import type { PravilaFiltera } from '../domain/filter.js';
import { SCRAPERI } from '../scraper/sources/index.js';
import type { Pretraga } from '../scraper/types.js';

export interface Podesavanja extends Omit<PodesavanjaRow, 'aktivniIzvori' | 'pretrage'> {
  aktivniIzvori: Izvor[];
  /** Korisničke pretrage po izvoru; izvor koji nije naveden koristi podrazumevane */
  pretrage: Partial<Record<Izvor, Pretraga[]>>;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function fromRow(row: PodesavanjaRow): Podesavanja {
  const aktivni = parseJson<string[]>(row.aktivniIzvori, [...IZVORI]).filter((i): i is Izvor =>
    (IZVORI as readonly string[]).includes(i),
  );
  return { ...row, aktivniIzvori: aktivni, pretrage: parseJson(row.pretrage, {}) };
}

export async function getSettings(): Promise<Podesavanja> {
  const row = await prisma.podesavanja.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  return fromRow(row);
}

export function toRules(s: Podesavanja): PravilaFiltera {
  return {
    placMinPovrsina: s.placMinPovrsina,
    placMaxPovrsina: s.placMaxPovrsina,
    placMaxCena: s.placMaxCena,
    kucaMaxCena: s.kucaMaxCena,
    kucaMinPovrsinaPlaca: s.kucaMinPovrsinaPlaca,
    kuceBezPlacaZaProveru: s.kuceBezPlacaZaProveru,
    bezCeneZaProveru: s.bezCeneZaProveru,
  };
}

const pretragaSchema = z.object({
  naziv: z.string().trim().min(1).max(120),
  url: z.string().trim().url(),
  tip: z.enum(TIPOVI),
});

export const settingsUpdateSchema = z
  .object({
    placMinPovrsina: z.number().min(0).max(1_000_000),
    placMaxPovrsina: z.number().min(0).max(10_000_000),
    placMaxCena: z.number().min(0).max(100_000_000),
    kucaMaxCena: z.number().min(0).max(100_000_000),
    kucaMinPovrsinaPlaca: z.number().min(0).max(10_000_000),
    kuceBezPlacaZaProveru: z.boolean(),
    bezCeneZaProveru: z.boolean(),
    kursEurRsd: z.number().min(1).max(1000),
    intervalMinuta: z.number().int().min(5).max(59),
    skeniranjeAktivno: z.boolean(),
    brojStranaPoPretrazi: z.number().int().min(1).max(20),
    aktivniIzvori: z.array(z.enum(IZVORI)),
    pretrage: z.partialRecord(z.enum(IZVORI), z.array(pretragaSchema)),
  })
  .partial()
  .refine((d) => d.placMinPovrsina === undefined || d.placMaxPovrsina === undefined || d.placMinPovrsina <= d.placMaxPovrsina, {
    message: 'Minimalna površina placa mora biti manja od maksimalne',
  });

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export async function updateSettings(input: SettingsUpdate): Promise<Podesavanja> {
  const { aktivniIzvori, pretrage, ...rest } = input;
  const row = await prisma.podesavanja.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {
      ...rest,
      ...(aktivniIzvori ? { aktivniIzvori: JSON.stringify(aktivniIzvori) } : {}),
      ...(pretrage ? { pretrage: JSON.stringify(pretrage) } : {}),
    },
  });
  return fromRow(row);
}

/** Pretrage za izvor sa zamenjenim {placMaxCena} / {kucaMaxCena} vrednostima iz podešavanja */
export function resolveSearches(izvor: Izvor, s: Podesavanja): Pretraga[] {
  const custom = s.pretrage[izvor];
  const list = custom && custom.length > 0 ? custom : SCRAPERI[izvor].pretrage;
  return list.map((p) => ({
    ...p,
    url: p.url
      .replaceAll('{placMaxCena}', String(Math.round(s.placMaxCena)))
      .replaceAll('{kucaMaxCena}', String(Math.round(s.kucaMaxCena))),
  }));
}
