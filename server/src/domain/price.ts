import { normalizeText, parseLocaleNumber } from './normalize.js';

/** Cene ispod ovog iznosa su "simbolične" (1€, 2€, "cena na upit") i tretiraju se kao nepoznate. */
const MIN_REALNA_CENA_EUR = 100;

export type Valuta = 'EUR' | 'RSD';

export function detectCurrency(text: string | null | undefined): Valuta {
  const t = normalizeText(text);
  if (/\b(rsd|din|dinara)\b/.test(t)) return 'RSD';
  return 'EUR';
}

/** Vraća cenu u EUR ili null ako cena nije navedena / je simbolična. */
export function normalizePrice(
  value: number | string | null | undefined,
  currency: Valuta | string | null | undefined,
  kursEurRsd: number,
): number | null {
  const n = typeof value === 'number' ? value : parseLocaleNumber(value ?? null);
  if (n === null || !Number.isFinite(n) || n <= 0) return null;
  const cur = (currency ?? 'EUR').toString().toUpperCase();
  const eur = cur === 'RSD' || cur === 'DIN' ? n / kursEurRsd : n;
  if (eur < MIN_REALNA_CENA_EUR) return null;
  return Math.round(eur);
}

/** Parsira tekst tipa "45.000 €", "309.000,00 EUR", "5.200.000 din", "Dogovor" */
export function parsePriceText(text: string | null | undefined, kursEurRsd: number): number | null {
  if (!text) return null;
  const m = text.replace(/\u00a0/g, ' ').match(/\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  return normalizePrice(m[0].replace(/\s/g, ''), detectCurrency(text), kursEurRsd);
}
