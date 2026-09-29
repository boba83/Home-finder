import type { GrupaLokacije } from './constants.js';
import { normalizeText } from './normalize.js';

export interface Mesto {
  naziv: string;
  grupa: GrupaLokacije;
  /** Regex izrazi nad normalizovanim tekstom (bez dijakritika, mala slova). Pokrivaju i padeže: "u Krušedolu", "na Banstolu"... */
  obrasci: string[];
}

export const MESTA: Mesto[] = [
  // GRUPA 1: Zapadna Fruška gora
  { naziv: 'Banstol', grupa: 'ZAPADNA_FG', obrasci: ['banstol\\w*'] },
  { naziv: 'Maradik', grupa: 'ZAPADNA_FG', obrasci: ['maradik\\w*'] },
  { naziv: 'Velika Remeta', grupa: 'ZAPADNA_FG', obrasci: ['velik\\w* remet\\w*', 'v remet\\w*'] },
  { naziv: 'Krušedol', grupa: 'ZAPADNA_FG', obrasci: ['krusedol\\w*'] },
  { naziv: 'Grgeteg', grupa: 'ZAPADNA_FG', obrasci: ['grgeteg\\w*'] },
  {
    naziv: 'Sremski Karlovci',
    grupa: 'ZAPADNA_FG',
    // "Novi Karlovci" (opština Inđija) nije isto mesto
    obrasci: ['sremsk\\w* karlov\\w*', 'sr karlov\\w*', 's karlov\\w*', '(?<!nov\\w* )karlov(ci|cima|aca)'],
  },
  { naziv: 'Srednji Matej', grupa: 'ZAPADNA_FG', obrasci: ['srednj\\w* mate\\w*'] },
  { naziv: 'Pučkaroš', grupa: 'ZAPADNA_FG', obrasci: ['puckaros\\w*'] },
  { naziv: 'Vizirac', grupa: 'ZAPADNA_FG', obrasci: ['vizir(ac|cu|ca|cem)'] },

  // GRUPA 2: Istočna Fruška gora
  { naziv: 'Glavica', grupa: 'ISTOCNA_FG', obrasci: ['glavic(a|i|u|e)'] },
  { naziv: 'Bocke', grupa: 'ISTOCNA_FG', obrasci: ['bock(e|ama|i)'] },
  // Samo "Ledinci" (bez "Novi") se tretira kao Stari Ledinci - sajtovi često izostave "Stari"
  { naziv: 'Stari Ledinci', grupa: 'ISTOCNA_FG', obrasci: ['star\\w* ledin\\w*', 'st ledin\\w*', '(?<!nov\\w* )ledin(ci|cima|aca)'] },
  { naziv: 'Rakovac', grupa: 'ISTOCNA_FG', obrasci: ['rakov(ac|cu|ca|cem)'] },
  { naziv: 'Dumbovo', grupa: 'ISTOCNA_FG', obrasci: ['dumbov(o|u|a)'] },
  { naziv: 'Banoštor', grupa: 'ISTOCNA_FG', obrasci: ['banostor\\w*'] },
  { naziv: 'Grabovo', grupa: 'ISTOCNA_FG', obrasci: ['grabov(o|u|a)'] },
  { naziv: 'Lug', grupa: 'ISTOCNA_FG', obrasci: ['lug(u)?'] },
  { naziv: 'Šusek', grupa: 'ISTOCNA_FG', obrasci: ['susek\\w*'] },
  { naziv: 'Koruška', grupa: 'ISTOCNA_FG', obrasci: ['korusk\\w*'] },
  { naziv: 'Sviloš', grupa: 'ISTOCNA_FG', obrasci: ['svilos\\w*'] },
  { naziv: 'Ležimir', grupa: 'ISTOCNA_FG', obrasci: ['lezimir\\w*'] },
];

const COMPILED = MESTA.map((m) => ({
  mesto: m,
  regex: new RegExp(`(?:^|\\s)(?:${m.obrasci.join('|')})(?=\\s|$)`),
}));

/**
 * Opštine u kojima oglas bez prepoznatog sela vredi otvoriti (detaljna stranica)
 * jer se selo često pominje tek u punom opisu. Veći gradovi (Novi Sad, Inđija...) su izostavljeni
 * da se ne bi otvarale stotine stranica.
 */
const OPSTINE_ZA_DETALJNU_PROVERU = ['sremski karlovci', 'irig', 'beocin'];

export interface RezultatLokacije {
  mesto: string;
  grupa: GrupaLokacije;
  /** Gde je mesto pronađeno - lokacija je najpouzdanija, opis najmanje */
  izvorPodatka: 'lokacija' | 'naslov' | 'opis';
}

const GRAD = 'Sremski Karlovci';

function matchesIn(text: string | null | undefined): Mesto[] {
  const norm = normalizeText(text);
  if (!norm) return [];
  return COMPILED.filter(({ regex }) => regex.test(norm)).map((c) => c.mesto);
}

/**
 * Klasifikuje oglas u grupu Zapadna/Istočna Fruška gora.
 * Redosled: polje lokacije -> naslov -> opis.
 * Selo ima prednost nad gradom (Sremski Karlovci): "Sremski Karlovci | Okolno mesto" + naslov "Vikendica na Banstolu" -> Banstol.
 */
export function classifyLocation(input: {
  lokacija?: string | null;
  naslov?: string | null;
  opis?: string | null;
}): RezultatLokacije | null {
  const fields: Array<[RezultatLokacije['izvorPodatka'], string | null | undefined]> = [
    ['lokacija', input.lokacija],
    ['naslov', input.naslov],
    ['opis', input.opis],
  ];

  for (const [izvorPodatka, text] of fields) {
    const matches = matchesIn(text);
    if (matches.length === 0) continue;
    let specific = matches.find((m) => m.naziv !== GRAD);
    if (!specific && izvorPodatka === 'lokacija') {
      specific = matchesIn(input.naslov).find((m) => m.naziv !== GRAD);
    }
    const mesto = specific ?? matches[0];
    return { mesto: mesto.naziv, grupa: mesto.grupa, izvorPodatka };
  }
  return null;
}

export function isInDetailCheckMunicipality(lokacija: string | null | undefined): boolean {
  const norm = normalizeText(lokacija);
  return OPSTINE_ZA_DETALJNU_PROVERU.some((o) => norm.includes(o));
}
