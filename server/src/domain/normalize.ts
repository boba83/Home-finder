const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

const LATIN_DIACRITICS: Record<string, string> = {
  č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj',
};

/**
 * Pretvara tekst u oblik pogodan za poređenje: mala slova, ćirilica -> latinica,
 * bez dijakritika (č/ć -> c, š -> s, ž -> z, đ -> dj) i bez interpunkcije.
 * "Krušedol" i "Krusedol" i "Крушедол" daju isti rezultat: "krusedol".
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.toLowerCase();
  s = s.replace(/[\u0400-\u04FF]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch);
  s = s.replace(/[čćšžđ]/g, (ch) => LATIN_DIACRITICS[ch] ?? ch);
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

export function cleanWhitespace(input: string | null | undefined): string {
  return (input ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parsira broj u srpskom/evropskom formatu:
 * "45.000" -> 45000, "17,18" -> 17.18, "1.234,56" -> 1234.56, "309000.00" -> 309000, "0.5" -> 0.5
 */
export function parseLocaleNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = raw.replace(/\u00a0|\s/g, '').replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    s = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastDot !== -1) {
    // Jedna ili više tačaka: "45.000" / "1.200.000" su hiljade, "0.5" / "309000.00" decimale
    const parts = s.split('.');
    const isThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] !== '0');
    s = isThousands ? parts.join('') : s;
  } else if (lastComma !== -1) {
    const parts = s.split(',');
    const isThousands = parts.length > 2;
    s = isThousands ? parts.join('') : s.replace(',', '.');
  }

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
