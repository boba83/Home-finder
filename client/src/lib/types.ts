export const IZVORI = ['KP', 'HALO', 'NEKRETNINE', 'NADJIDOM', 'OGLASI'] as const;
export type Izvor = (typeof IZVORI)[number];

export const IZVOR_NAZIV: Record<Izvor, string> = {
  KP: 'KupujemProdajem',
  HALO: 'Halo Oglasi',
  NEKRETNINE: 'Nekretnine.rs',
  NADJIDOM: 'NadjiDom',
  OGLASI: 'Oglasi.rs',
};

export const IZVOR_KRATKO: Record<Izvor, string> = {
  KP: 'KP',
  HALO: 'Halo',
  NEKRETNINE: 'Nekretnine.rs',
  NADJIDOM: 'NadjiDom',
  OGLASI: 'Oglasi.rs',
};

export type TipNekretnine = 'PLAC' | 'KUCA' | 'VIKENDICA';
export const TIP_NAZIV: Record<TipNekretnine, string> = { PLAC: 'Plac', KUCA: 'Kuća', VIKENDICA: 'Vikendica' };

export type GrupaLokacije = 'ZAPADNA_FG' | 'ISTOCNA_FG';
export const GRUPA_NAZIV: Record<GrupaLokacije, string> = {
  ZAPADNA_FG: 'Zapadna FG',
  ISTOCNA_FG: 'Istočna FG',
};

export type StatusOglasa = 'ODOBREN' | 'ZA_PROVERU' | 'ODBIJEN';

export interface Oglas {
  id: number;
  izvor: Izvor;
  izvorId: string;
  link: string;
  naslov: string;
  opis: string | null;
  cena: number | null;
  tipNekretnine: TipNekretnine;
  povrsinaObjekta: number | null;
  povrsinaPlaca: number | null;
  lokacija: string | null;
  mesto: string | null;
  grupaLokacije: GrupaLokacije;
  slika: string | null;
  status: StatusOglasa;
  razlogStatusa: string | null;
  novo: boolean;
  omiljeno: boolean;
  arhivirano: boolean;
  objavljeno: string | null;
  pronadjeno: string;
}

export interface ListingsResponse {
  items: Oglas[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Stats {
  matrica: Array<{ grupa: GrupaLokacije; tip: TipNekretnine; broj: number }>;
  poGrupi: Partial<Record<GrupaLokacije, number>>;
  poTipu: Partial<Record<TipNekretnine, number>>;
  poIzvoru: Partial<Record<Izvor, number>>;
  novih: number;
  omiljenih: number;
  arhiviranih: number;
  zaProveru: number;
  odbijenih: number;
}

export interface Pretraga {
  naziv: string;
  url: string;
  tip: TipNekretnine;
}

export interface Podesavanja {
  placMinPovrsina: number;
  placMaxPovrsina: number;
  placMaxCena: number;
  kucaMaxCena: number;
  kucaMinPovrsinaPlaca: number;
  kuceBezPlacaZaProveru: boolean;
  bezCeneZaProveru: boolean;
  kursEurRsd: number;
  intervalMinuta: number;
  skeniranjeAktivno: boolean;
  brojStranaPoPretrazi: number;
  aktivniIzvori: Izvor[];
  pretrage: Partial<Record<Izvor, Pretraga[]>>;
  azurirano: string;
}

export interface IzvorInfo {
  id: Izvor;
  naziv: string;
  podrazumevanePretrage: Pretraga[];
}

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

export interface SkeniranjeLog {
  id: number;
  pocetak: string;
  kraj: string | null;
  status: 'U_TOKU' | 'USPESNO' | 'DELIMICNO' | 'GRESKA';
  pregledano: number;
  novih: number;
  odobrenih: number;
  detalji: Partial<Record<Izvor, StatistikaIzvora>> | { greska: string } | null;
}

export interface ScrapeStatus {
  running: boolean;
  progress: { izvor: Izvor; pretraga: string; strana: number } | null;
  blokirani: Array<{ host: string; until: string }>;
  intervalMinuta: number | null;
  sledeceSkeniranje: string | null;
  logs: SkeniranjeLog[];
}

export interface PushPreferences {
  grupe: GrupaLokacije[];
  kategorije: TipNekretnine[];
  zaProveru: boolean;
}
