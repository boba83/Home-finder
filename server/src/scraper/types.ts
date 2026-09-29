import type { Izvor, TipNekretnine } from '../domain/constants.js';

/** Definicija jedne pretrage (URL stranice sa listom oglasa) */
export interface Pretraga {
  naziv: string;
  /** URL prve strane. Podržava {placMaxCena} i {kucaMaxCena} - zamenjuju se vrednostima iz podešavanja. */
  url: string;
  tip: TipNekretnine;
}

/** Sirovi podaci o oglasu kako ih parser izvuče sa sajta (pre klasifikacije i validacije) */
export interface SiroviOglas {
  izvor: Izvor;
  izvorId: string;
  link: string;
  naslov: string;
  opis?: string | null;
  /** Cena u EUR (već konvertovana) ili null ako nije navedena */
  cena?: number | null;
  tipHint?: TipNekretnine | null;
  povrsinaObjekta?: number | null;
  povrsinaPlaca?: number | null;
  lokacija?: string | null;
  slika?: string | null;
  objavljeno?: Date | null;
}

export interface ParserContext {
  kursEurRsd: number;
}

export interface DetaljiOglasa {
  opis?: string | null;
  povrsinaPlaca?: number | null;
  povrsinaObjekta?: number | null;
  cena?: number | null;
  lokacija?: string | null;
  slika?: string | null;
  tipHint?: TipNekretnine | null;
}

export interface IzvorScraper {
  id: Izvor;
  naziv: string;
  /** Podrazumevane pretrage za ovaj sajt */
  pretrage: Pretraga[];
  /** Vraća URL za datu stranu (1 = prva) */
  urlStrane(url: string, strana: number): string;
  /** Parsira stranicu sa listom oglasa */
  parsirajListu(html: string, pretraga: Pretraga, ctx: ParserContext): SiroviOglas[];
  /** Parsira stranicu pojedinačnog oglasa (opis, površina placa...) */
  parsirajDetalje?(html: string, oglas: SiroviOglas, ctx: ParserContext): DetaljiOglasa;
}
