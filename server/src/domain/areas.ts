import { normalizeText, parseLocaleNumber } from './normalize.js';

export const M2_PO_JEDINICI = {
  m2: 1,
  ar: 100,
  ha: 10_000,
  /** Katastarsko jutro */
  jutro: 5754.64,
} as const;

export type JedinicaPovrsine = keyof typeof M2_PO_JEDINICI;

const NUM = '(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)';
const UNIT =
  '(m2|m²|m\\^2|kvm|kv\\.?\\s?m|kvadrat\\w*|metara kvadratnih|ari|ara|ar|hektar\\w*|ha|jutr\\w*|jutara|juta)';

function unitFromToken(token: string): JedinicaPovrsine | null {
  const t = normalizeText(token).replace(/\s/g, '');
  if (!t) return null;
  if (t.startsWith('m') || t.startsWith('kv') || t.startsWith('metara')) return 'm2';
  if (t === 'a' || t.startsWith('ar')) return 'ar';
  if (t === 'ha' || t.startsWith('hektar')) return 'ha';
  if (t.startsWith('jut')) return 'jutro';
  return null;
}

/**
 * Ispravlja česte greške oglašivača: "1773 ari" za vikendicu je gotovo sigurno 1773 m²,
 * "1.421 ha" je 1,421 ha (tačka kao decimalni separator).
 */
function sanitize(value: number, unit: JedinicaPovrsine, raw: string): number {
  if (unit === 'ar' && value >= 300 && Number.isInteger(value) && !/[.,]\d{1,2}$/.test(raw)) return value;
  if (unit === 'ha' && value > 100 && raw.includes('.')) {
    const asDecimal = Number.parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(asDecimal)) return asDecimal * M2_PO_JEDINICI.ha;
  }
  return value * M2_PO_JEDINICI[unit];
}

/** Pretvara vrednost + jedinicu u m², uz ispravku očiglednih grešaka u jedinici. */
export function toSquareMeters(value: number | null | undefined, unit: JedinicaPovrsine, raw = String(value ?? '')): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(sanitize(value, unit, raw) * 100) / 100;
}

/**
 * Parsira strukturisano polje površine: "25 ari", "4.49 ara", "11,4 a", "991m2", "230,40 ari", "1,5 ha".
 * Ako jedinica nije navedena, koristi `defaultUnit`.
 */
export function parseAreaField(text: string | null | undefined, defaultUnit: JedinicaPovrsine = 'm2'): number | null {
  if (!text) return null;
  const cleaned = text.replace(/\u00a0/g, ' ').toLowerCase();
  const m = cleaned.match(new RegExp(`${NUM}\\s*(${UNIT.slice(1, -1)}|a\\b)?`));
  if (!m) return null;
  const raw = m[1];
  const value = parseLocaleNumber(raw);
  const unit = (m[2] && unitFromToken(m[2])) || defaultUnit;
  return toSquareMeters(value, unit, raw);
}

const PLOT_KEYWORDS =
  /(plac\w*|parcel\w*|okucnic\w*|zemljist\w*|dvorist\w*|imanj\w*|posed\w*|plodn\w*|vocnjak\w*|vinograd\w*|basta\w*|livad\w*|njiv\w*)/;
const BUILDING_KEYWORDS = /(kuc\w*|vikendic\w*|objek\w*|stambe\w*|prizem\w*|sprat\w*|potkrovlj\w*|podrum\w*|garaz\w*|korisn\w*|neto|bruto|stan\w*|soba|sobe|kvadratur\w*)/;

interface AreaMention {
  index: number;
  m2: number;
  unit: JedinicaPovrsine;
  context: string;
}

function findAreaMentions(text: string): AreaMention[] {
  const lowered = text.replace(/\u00a0/g, ' ').toLowerCase();
  const re = new RegExp(`${NUM}\\s*${UNIT}(?![a-z])`, 'g');
  const mentions: AreaMention[] = [];
  for (const m of lowered.matchAll(re)) {
    const unit = unitFromToken(m[2]);
    const value = parseLocaleNumber(m[1]);
    if (!unit || value === null) continue;
    const m2 = toSquareMeters(value, unit, m[1]);
    if (!m2) continue;
    const start = m.index ?? 0;
    const context = normalizeText(lowered.slice(Math.max(0, start - 45), start + m[0].length + 25));
    mentions.push({ index: start, m2, unit, context });
  }
  return mentions;
}

/**
 * Izvlači površinu PLACA iz slobodnog teksta (naslov/opis).
 * - "plac 10 ari", "na placu od 1.200 m2", "okućnica 15a", "0,5 ha" -> površina placa
 * - "kuća 80m2" se ignoriše (m² bez reči vezane za plac, ili uz reč "kuća")
 */
export function extractPlotAreaFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const mentions = findAreaMentions(text);
  if (mentions.length === 0) return null;

  const scored = mentions.map((m) => {
    const before = m.context.slice(0, Math.max(0, m.context.length - 30));
    let score = 0;
    if (PLOT_KEYWORDS.test(m.context)) score += 2;
    if (PLOT_KEYWORDS.test(before)) score += 1;
    if (m.unit !== 'm2') score += 2;
    if (m.unit === 'm2' && BUILDING_KEYWORDS.test(m.context) && !PLOT_KEYWORDS.test(m.context)) score -= 3;
    return { ...m, score };
  });

  const candidates = scored.filter((m) => m.score >= 2).sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.m2 ?? null;
}

/** Površina objekta iz teksta, npr. naslov "Kuća 80m2 na placu od 10 ari" -> 80 */
export function extractBuildingAreaFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const mention = findAreaMentions(text).find(
    (m) => m.unit === 'm2' && m.m2 < 1000 && !PLOT_KEYWORDS.test(m.context.slice(0, Math.max(0, m.context.length - 25))),
  );
  return mention?.m2 ?? null;
}
