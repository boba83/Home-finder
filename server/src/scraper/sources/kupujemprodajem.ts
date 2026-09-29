import * as cheerio from 'cheerio';
import { parseAreaField, extractPlotAreaFromText } from '../../domain/areas.js';
import { cleanWhitespace } from '../../domain/normalize.js';
import { normalizePrice } from '../../domain/price.js';
import type { IzvorScraper, SiroviOglas } from '../types.js';
import { absoluteUrl, extractNextData, parseIsoDate, setQueryParam } from '../utils.js';

const BASE = 'https://www.kupujemprodajem.com';
const IMG_BASE = 'https://images.kupujemprodajem.com';

// Kategorija 2821 = Nekretnine | Prodaja; grupe: 2823 Kuće, 2825 Vikendice, 2828 Placevi i zemljište.
// KP ne filtrira nekretnine po lokaciji preko URL-a, pa se čitaju najnovije strane (uz filter cene),
// a lokacija se proverava lokalno - KP u `location_name` navodi i selo ("Irig | Okolno mesto | Krušedol").
const search = (groupId: number, maxCena: string) =>
  `${BASE}/nekretnine-prodaja/pretraga?categoryId=2821&groupId=${groupId}&priceTo=${maxCena}&currency=eur&order=posted%20desc`;

interface KpAttribute {
  code: string;
  values: string[];
}

function attributes(ad: any): KpAttribute[] {
  const sections = ad.ad_attributes ?? ad.adAttributes ?? [];
  return sections.flatMap((s: any) => (Array.isArray(s?.attributes) ? s.attributes : []));
}

function attr(list: KpAttribute[], code: string): string | null {
  return list.find((a) => a.code === code)?.values?.join(' ') ?? null;
}

function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return cleanWhitespace(cheerio.load(`<div>${html.replace(/<br\s*\/?>/gi, '\n')}</div>`)('div').text());
}

export const kupujemProdajem: IzvorScraper = {
  id: 'KP',
  naziv: 'KupujemProdajem',
  pretrage: [
    { naziv: 'KP - Kuće', url: search(2823, '{kucaMaxCena}'), tip: 'KUCA' },
    { naziv: 'KP - Vikendice', url: search(2825, '{kucaMaxCena}'), tip: 'VIKENDICA' },
    { naziv: 'KP - Placevi', url: search(2828, '{placMaxCena}'), tip: 'PLAC' },
  ],

  urlStrane: (url, strana) => setQueryParam(url, 'page', strana > 1 ? strana : null),

  parsirajListu(html, pretraga, ctx) {
    const data = extractNextData(html);
    const search = data?.props?.initialReduxState?.search;
    const ads: any[] = search?.lastSearchResult?.ads ?? [];
    const result: SiroviOglas[] = [];

    for (const ad of ads) {
      const id = ad.ad_id ?? ad.id;
      const adUrl = ad.ad_url ?? ad.adUrl;
      if (!id || !adUrl) continue;
      const attrs = attributes(ad);
      const areaRaw = attr(attrs, 'realEstateArea');
      const landRaw = attr(attrs, 'realEstateLandArea');
      const isPlot = pretraga.tip === 'PLAC';
      const photo = ad.photo1_tmb_300x300 ?? ad.photo_path1;

      result.push({
        izvor: 'KP',
        izvorId: String(id),
        link: absoluteUrl(adUrl, BASE)!,
        naslov: cleanWhitespace(ad.name),
        opis: cleanWhitespace(ad.description_snippet ?? ''),
        cena: normalizePrice(ad.price, ad.currency, ctx.kursEurRsd),
        tipHint: pretraga.tip,
        povrsinaObjekta: isPlot ? null : parseAreaField(areaRaw),
        povrsinaPlaca: isPlot ? parseAreaField(landRaw ?? areaRaw, 'ar') : parseAreaField(landRaw, 'ar'),
        lokacija: ad.location_name ?? null,
        slika: photo ? absoluteUrl(photo, IMG_BASE) : null,
        objavljeno: parseIsoDate(ad.posted),
      });
    }
    return result;
  },

  parsirajDetalje(html, oglas) {
    const data = extractNextData(html);
    const ad = data?.props?.initialReduxState?.ad?.byId?.[oglas.izvorId];
    if (!ad) return {};
    const attrs = attributes(ad);
    const opis = htmlToText(ad.description);
    const land = parseAreaField(attr(attrs, 'realEstateLandArea'), 'ar');
    return {
      opis: opis || oglas.opis,
      lokacija: ad.location ?? oglas.lokacija,
      povrsinaPlaca: land ?? extractPlotAreaFromText(`${oglas.naslov} ${opis}`),
    };
  },
};
