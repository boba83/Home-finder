import { parseAreaField, extractPlotAreaFromText } from '../../domain/areas.js';
import { cleanWhitespace, normalizeText } from '../../domain/normalize.js';
import { normalizePrice } from '../../domain/price.js';
import type { TipNekretnine } from '../../domain/constants.js';
import type { IzvorScraper, Pretraga, SiroviOglas } from '../types.js';
import { OPSTINE } from '../opstine.js';
import { extractNextData, setQueryParam } from '../utils.js';

const BASE = 'https://www.nekretnine.rs';

// Nekretnine.rs (Indomio platforma): vikendice su u kategoriji "samostalnih kuća".
// Parametri: prezzoMassimo = maks. cena, criterio=data&ordine=desc = najnoviji prvo, pag = strana.
const pretrage: Pretraga[] = OPSTINE.flatMap((o) => [
  {
    naziv: `Nekretnine.rs - Kuće ${o.naziv}`,
    url: `${BASE}/prodaja-samostalnih-kuca/${o.nekretnine}/?prezzoMassimo={kucaMaxCena}&criterio=data&ordine=desc`,
    tip: 'KUCA' as const,
  },
  {
    naziv: `Nekretnine.rs - Placevi ${o.naziv}`,
    url: `${BASE}/prodaja-zemljista/${o.nekretnine}/?prezzoMassimo={placMaxCena}&criterio=data&ordine=desc`,
    tip: 'PLAC' as const,
  },
]);

function tipFromTypology(name: string | null | undefined, fallback: TipNekretnine): TipNekretnine {
  const t = normalizeText(name);
  if (fallback === 'PLAC' || t.includes('zemlji') || t.includes('plac')) return 'PLAC';
  if (t.includes('vikend')) return 'VIKENDICA';
  return fallback;
}

function findResults(data: any): any[] {
  const queries: any[] = data?.props?.pageProps?.dehydratedState?.queries ?? [];
  for (const q of queries) {
    const results = q?.state?.data?.results;
    if (Array.isArray(results)) return results;
  }
  return [];
}

export const nekretnineRs: IzvorScraper = {
  id: 'NEKRETNINE',
  naziv: 'Nekretnine.rs',
  pretrage,

  urlStrane: (url, strana) => setQueryParam(url, 'pag', strana > 1 ? strana : null),

  parsirajListu(html, pretraga, ctx) {
    const data = extractNextData(html);
    const result: SiroviOglas[] = [];

    for (const r of findResults(data)) {
      const re = r?.realEstate;
      if (!re?.id) continue;
      const prop = re.properties?.[0] ?? {};
      const loc = prop.location ?? {};
      const lokacija = [loc.city, loc.macrozone, loc.microzone, loc.address].filter(Boolean).join(' | ');
      const tip = tipFromTypology(re.typology?.name ?? prop.typology?.name, pretraga.tip);
      const surface = parseAreaField(prop.surface);
      const price = re.price?.visible === false ? null : (re.price?.value ?? prop.price?.value ?? null);

      result.push({
        izvor: 'NEKRETNINE',
        izvorId: String(re.id),
        link: r.seo?.url ?? `${BASE}/oglasi/${re.id}/`,
        naslov: cleanWhitespace(re.title),
        opis: cleanWhitespace(prop.caption ?? ''),
        cena: normalizePrice(price, 'EUR', ctx.kursEurRsd),
        tipHint: tip,
        povrsinaObjekta: tip === 'PLAC' ? null : surface,
        povrsinaPlaca: tip === 'PLAC' ? surface : null,
        lokacija,
        slika: prop.photo?.urls?.medium ?? prop.photo?.urls?.small ?? null,
        objavljeno: null,
      });
    }
    return result;
  },

  parsirajDetalje(html, oglas) {
    const data = extractNextData(html);
    const re = data?.props?.pageProps?.detailData?.realEstate;
    if (!re) return {};
    const prop = re.properties?.[0] ?? {};
    const opis = cleanWhitespace(prop.description ?? '');
    const loc = prop.location ?? {};
    const lokacija = [loc.city, loc.macrozone, loc.microzone, loc.address].filter(Boolean).join(' | ');

    // Kuće na ovom sajtu nemaju strukturisano polje za plac - traži se u opisu ("plac 10 ari")
    const plac = oglas.tipHint === 'PLAC' ? oglas.povrsinaPlaca : extractPlotAreaFromText(`${oglas.naslov}. ${opis}`);

    return {
      opis: opis || oglas.opis,
      lokacija: lokacija || oglas.lokacija,
      povrsinaPlaca: plac ?? oglas.povrsinaPlaca,
    };
  },
};
