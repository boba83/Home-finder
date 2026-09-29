import type { TipNekretnine } from './constants.js';
import { normalizeText } from './normalize.js';

const VIKENDICA = /\b(vikendic\w*|vikend kuc\w*|vikend objek\w*|weekend\w*|brvnar\w*)\b/;
const KUCA = /\b(kuc[aeiu]\w*|porodicn\w* kuc\w*|samostaln\w* kuc\w*|dvojn\w*|seosk\w* kuc\w*)\b/;
const PLAC = /\b(plac\w*|parcel\w*|zemljist\w*|njiv\w*|vocnjak\w*|vinograd\w*|livad\w*)\b/;

/**
 * Određuje tip nekretnine. `hint` dolazi iz kategorije pretrage (najpouzdanije),
 * a naslov služi da se kuća prepozna kao vikendica ili da se ispravi pogrešna kategorija.
 */
export function detectPropertyType(hint: TipNekretnine | null | undefined, ...texts: Array<string | null | undefined>): TipNekretnine {
  const t = normalizeText(texts.filter(Boolean).join(' '));

  if (hint === 'PLAC') {
    // Plac sa objektom ("plac sa vikendicom") ostaje plac - tako ga je oglašivač kategorisao
    return 'PLAC';
  }
  if (hint === 'VIKENDICA') return 'VIKENDICA';
  if (hint === 'KUCA') return VIKENDICA.test(t) ? 'VIKENDICA' : 'KUCA';

  if (VIKENDICA.test(t)) return 'VIKENDICA';
  if (KUCA.test(t)) return 'KUCA';
  if (PLAC.test(t)) return 'PLAC';
  return 'KUCA';
}
