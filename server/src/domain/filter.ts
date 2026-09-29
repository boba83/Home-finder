import type { StatusOglasa, TipNekretnine } from './constants.js';

export interface PravilaFiltera {
  placMinPovrsina: number;
  placMaxPovrsina: number;
  placMaxCena: number;
  kucaMaxCena: number;
  kucaMinPovrsinaPlaca: number;
  /** Kuća/vikendica bez navedene površine placa: true -> "Za proveru", false -> odbijena */
  kuceBezPlacaZaProveru: boolean;
  /** Oglas bez cene ("cena na upit"): true -> "Za proveru", false -> odbijen */
  bezCeneZaProveru: boolean;
}

export const PODRAZUMEVANA_PRAVILA: PravilaFiltera = {
  placMinPovrsina: 500,
  placMaxPovrsina: 7000,
  placMaxCena: 26000,
  kucaMaxCena: 70000,
  kucaMinPovrsinaPlaca: 700,
  kuceBezPlacaZaProveru: true,
  bezCeneZaProveru: true,
};

export interface PodaciZaFilter {
  tipNekretnine: TipNekretnine;
  cena: number | null;
  povrsinaPlaca: number | null;
  /** Mesto je pronađeno samo u opisu (npr. "10 min do Banstola") - oglas može biti iz drugog sela */
  lokacijaIzOpisa?: boolean;
  mesto?: string | null;
}

export interface RezultatFiltera {
  status: StatusOglasa;
  razlog: string;
}

const eur = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const m2 = (n: number) => `${Math.round(n).toLocaleString('de-DE')} m²`;

/**
 * Stroga pravila:
 * - PLAC: površina placa u opsegu [placMinPovrsina, placMaxPovrsina] (500-7000 m²) i cena <= placMaxCena (26.000 €)
 * - KUĆA / VIKENDICA: cena <= kucaMaxCena (70.000 €) i površina placa >= kucaMinPovrsinaPlaca (700 m²)
 */
export function evaluateListing(o: PodaciZaFilter, p: PravilaFiltera): RezultatFiltera {
  const r = evaluateCriteria(o, p);
  if (r.status === 'ODOBREN' && o.lokacijaIzOpisa) {
    return { status: 'ZA_PROVERU', razlog: `Mesto (${o.mesto ?? '?'}) je pomenuto samo u opisu - proveri tačnu lokaciju` };
  }
  return r;
}

function evaluateCriteria(o: PodaciZaFilter, p: PravilaFiltera): RezultatFiltera {
  const nepoznataCena = o.cena === null || o.cena === undefined;

  if (o.tipNekretnine === 'PLAC') {
    if (!nepoznataCena && o.cena! > p.placMaxCena) {
      return { status: 'ODBIJEN', razlog: `Cena ${eur(o.cena!)} je veća od ${eur(p.placMaxCena)}` };
    }
    if (o.povrsinaPlaca === null || o.povrsinaPlaca === undefined) {
      return { status: 'ZA_PROVERU', razlog: 'Površina placa nije navedena' };
    }
    if (o.povrsinaPlaca < p.placMinPovrsina) {
      return { status: 'ODBIJEN', razlog: `Plac ${m2(o.povrsinaPlaca)} je manji od ${m2(p.placMinPovrsina)}` };
    }
    if (o.povrsinaPlaca > p.placMaxPovrsina) {
      return { status: 'ODBIJEN', razlog: `Plac ${m2(o.povrsinaPlaca)} je veći od ${m2(p.placMaxPovrsina)}` };
    }
    if (nepoznataCena) {
      return p.bezCeneZaProveru
        ? { status: 'ZA_PROVERU', razlog: 'Cena nije navedena' }
        : { status: 'ODBIJEN', razlog: 'Cena nije navedena' };
    }
    return { status: 'ODOBREN', razlog: 'Plac zadovoljava kriterijume' };
  }

  // KUĆA ili VIKENDICA
  if (!nepoznataCena && o.cena! > p.kucaMaxCena) {
    return { status: 'ODBIJEN', razlog: `Cena ${eur(o.cena!)} je veća od ${eur(p.kucaMaxCena)}` };
  }
  if (o.povrsinaPlaca === null || o.povrsinaPlaca === undefined) {
    return p.kuceBezPlacaZaProveru
      ? { status: 'ZA_PROVERU', razlog: 'Površina placa nije navedena' }
      : { status: 'ODBIJEN', razlog: 'Površina placa nije navedena' };
  }
  if (o.povrsinaPlaca < p.kucaMinPovrsinaPlaca) {
    return { status: 'ODBIJEN', razlog: `Plac ${m2(o.povrsinaPlaca)} je manji od ${m2(p.kucaMinPovrsinaPlaca)}` };
  }
  if (nepoznataCena) {
    return p.bezCeneZaProveru
      ? { status: 'ZA_PROVERU', razlog: 'Cena nije navedena' }
      : { status: 'ODBIJEN', razlog: 'Cena nije navedena' };
  }
  return { status: 'ODOBREN', razlog: 'Kuća/vikendica zadovoljava kriterijume' };
}

/** Brza provera pre otvaranja detaljne stranice: da li oglas uopšte ima šanse da prođe. */
export function canPossiblyPass(o: Pick<PodaciZaFilter, 'tipNekretnine' | 'cena'>, p: PravilaFiltera): boolean {
  if (o.cena === null) return true;
  return o.tipNekretnine === 'PLAC' ? o.cena <= p.placMaxCena : o.cena <= p.kucaMaxCena;
}
