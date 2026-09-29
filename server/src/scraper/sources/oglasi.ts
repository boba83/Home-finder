import * as cheerio from 'cheerio';
import { parseAreaField, extractPlotAreaFromText } from '../../domain/areas.js';
import { cleanWhitespace, normalizeText } from '../../domain/normalize.js';
import { normalizePrice, parsePriceText } from '../../domain/price.js';
import type { IzvorScraper, Pretraga, SiroviOglas } from '../types.js';
import { OPSTINE } from '../opstine.js';
import { absoluteUrl, parseIsoDate, setQueryParam } from '../utils.js';

const BASE = 'https://www.oglasi.rs';

// Oglasi.rs podrazumevano sortira po datumu obnove (najnoviji prvo); parametar strane je `p`.
const pretrage: Pretraga[] = OPSTINE.flatMap((o) => [
  { naziv: `Oglasi.rs - Kuće ${o.naziv}`, url: `${BASE}/nekretnine/prodaja-kuca/${o.oglasi}`, tip: 'KUCA' as const },
  { naziv: `Oglasi.rs - Vikendice ${o.naziv}`, url: `${BASE}/nekretnine/prodaja-vikendica/${o.oglasi}`, tip: 'VIKENDICA' as const },
  { naziv: `Oglasi.rs - Placevi ${o.naziv}`, url: `${BASE}/nekretnine/prodaja-placeva/${o.oglasi}`, tip: 'PLAC' as const },
]);

export const oglasiRs: IzvorScraper = {
  id: 'OGLASI',
  naziv: 'Oglasi.rs',
  pretrage,

  urlStrane: (url, strana) => setQueryParam(url, 'p', strana > 1 ? strana : null),

  parsirajListu(html, pretraga, ctx) {
    const $ = cheerio.load(html);
    const result: SiroviOglas[] = [];

    $('article[itemprop="itemListElement"]').each((_, el) => {
      const art = $(el);
      const link = art.find('a.fpogl-list-title').first();
      const href = link.attr('href');
      const id = href?.match(/\/oglas\/([\w-]+)\//)?.[1];
      if (!href || !id) return;

      const priceEl = art.find('[itemprop="price"]').first();
      const currency = art.find('[itemprop="priceCurrency"]').first().attr('content');
      const cena = priceEl.attr('content')
        ? normalizePrice(priceEl.attr('content')!, currency ?? 'EUR', ctx.kursEurRsd)
        : parsePriceText(cleanWhitespace(art.find('.text-price').first().text()), ctx.kursEurRsd);

      let povrsinaObjekta = null as number | null;
      let povrsinaPlaca = null as number | null;
      art.find('.col-sm-6').each((__, col) => {
        const label = normalizeText($(col).clone().children('strong').remove().end().text());
        const value = cleanWhitespace($(col).find('strong').text());
        if (label.startsWith('kvadratura')) povrsinaObjekta = parseAreaField(value);
        else if (label.includes('zemljista') || label.includes('placa') || label.startsWith('povrsina')) {
          povrsinaPlaca = parseAreaField(value);
        }
      });

      if (pretraga.tip === 'PLAC' && povrsinaPlaca === null && povrsinaObjekta !== null) {
        povrsinaPlaca = povrsinaObjekta;
        povrsinaObjekta = null;
      }

      const categories = art
        .find('a[itemprop="category"]')
        .map((__, a) => cleanWhitespace($(a).text()))
        .get()
        .slice(2)
        .filter((c) => normalizeText(c) !== 'nije navedeno');

      result.push({
        izvor: 'OGLASI',
        izvorId: id,
        link: absoluteUrl(href, BASE)!,
        naslov: cleanWhitespace(art.find('[itemprop="name"]').first().text() || link.text()),
        opis: cleanWhitespace(art.find('[itemprop="description"]').first().text()),
        cena,
        tipHint: pretraga.tip,
        povrsinaObjekta,
        povrsinaPlaca,
        lokacija: categories.join(' | '),
        slika: art.find('img[itemprop="image"]').first().attr('src') ?? null,
        objavljeno: parseIsoDate(art.find('time[datetime]').first().attr('datetime')),
      });
    });
    return result;
  },

  parsirajDetalje(html, oglas) {
    const $ = cheerio.load(html);
    let plac = null as number | null;
    $('tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 2) return;
      const label = normalizeText(cells.first().text());
      if (label.includes('povrsina zemljista') || label.includes('povrsina placa')) {
        plac = parseAreaField(cleanWhitespace(cells.eq(1).text()));
      }
    });
    const opis = cleanWhitespace($('[itemprop="description"]').first().text());
    return {
      opis: opis || oglas.opis,
      povrsinaPlaca: plac ?? oglas.povrsinaPlaca ?? extractPlotAreaFromText(`${oglas.naslov}. ${opis}`),
    };
  },
};
