import * as cheerio from 'cheerio';
import { parseAreaField, extractPlotAreaFromText } from '../../domain/areas.js';
import { cleanWhitespace, normalizeText } from '../../domain/normalize.js';
import { parsePriceText } from '../../domain/price.js';
import type { TipNekretnine } from '../../domain/constants.js';
import type { IzvorScraper, Pretraga, SiroviOglas } from '../types.js';
import { OPSTINE } from '../opstine.js';
import { absoluteUrl, parseSerbianDate, setQueryParam } from '../utils.js';

const BASE = 'https://www.nadjidom.com';

// NadjiDom podrazumevano sortira po datumu (najnoviji prvo). Filter cene se primenjuje lokalno.
const pretrage: Pretraga[] = OPSTINE.flatMap((o) => [
  { naziv: `NadjiDom - Kuće ${o.naziv}`, url: `${BASE}/sr/nekretnine/prodaja/kuce+${o.nadjidom}`, tip: 'KUCA' as const },
  { naziv: `NadjiDom - Vikendice ${o.naziv}`, url: `${BASE}/sr/nekretnine/prodaja/vikendica+${o.nadjidom}`, tip: 'VIKENDICA' as const },
  { naziv: `NadjiDom - Placevi ${o.naziv}`, url: `${BASE}/sr/nekretnine/prodaja/placevi+${o.nadjidom}`, tip: 'PLAC' as const },
]);

function tipFromText(value: string, fallback: TipNekretnine): TipNekretnine {
  const t = normalizeText(value);
  if (fallback === 'PLAC' || t.includes('plac') || t.includes('zemlji')) return 'PLAC';
  if (t.includes('vikend')) return 'VIKENDICA';
  return fallback;
}

export const nadjiDom: IzvorScraper = {
  id: 'NADJIDOM',
  naziv: 'NadjiDom',
  pretrage,

  urlStrane: (url, strana) => setQueryParam(url, 'page', strana > 1 ? strana : null),

  parsirajListu(html, pretraga, ctx) {
    const $ = cheerio.load(html);
    const result: SiroviOglas[] = [];

    $('.estate-loop').each((_, el) => {
      const card = $(el);
      const link = card.find('a.ad-title').first();
      const href = link.attr('href') ?? card.find('a.card-img-top').attr('href');
      const id = href?.match(/\/details\/(\d+)/)?.[1];
      if (!href || !id) return;

      const priceText = cleanWhitespace(card.find('.card-body-content .fw-bold').first().text());
      const tip = tipFromText(cleanWhitespace(card.find('.estate-type_name').first().text()), pretraga.tip);
      const surface = parseAreaField(cleanWhitespace(card.find('.estate-square, .param.surface').first().text()));
      const params = card
        .find('ul.parameters li')
        .map((__, li) => cleanWhitespace($(li).text()))
        .get()
        .join(', ');

      result.push({
        izvor: 'NADJIDOM',
        izvorId: id,
        link: absoluteUrl(href, BASE)!,
        naslov: cleanWhitespace(link.attr('title') || link.text()),
        opis: params,
        cena: parsePriceText(priceText, ctx.kursEurRsd),
        tipHint: tip,
        povrsinaObjekta: tip === 'PLAC' ? null : surface,
        povrsinaPlaca: tip === 'PLAC' ? surface : null,
        lokacija: cleanWhitespace(card.find('p.location').first().text()),
        slika: card.find('img.list-image').first().attr('src') ?? null,
        objavljeno: parseSerbianDate(card.find('.card-body-footer .text-muted').first().text()),
      });
    });
    return result;
  },

  parsirajDetalje(html, oglas) {
    const $ = cheerio.load(html);
    const fields = new Map<string, string>();
    $('li.list-group-item').each((_, li) => {
      const spans = $(li).find('span');
      if (spans.length < 2) return;
      fields.set(normalizeText(spans.first().text()), cleanWhitespace(spans.last().text()));
    });

    const opis = cleanWhitespace($('.estate-description').first().text()) || cleanWhitespace($('meta[property="og:description"]').attr('content'));
    const placRaw = fields.get('povrsina placa');
    const plac = placRaw ? parseAreaField(placRaw, 'ar') : extractPlotAreaFromText(`${oglas.naslov}. ${opis}`);

    return {
      opis: opis || oglas.opis,
      povrsinaPlaca: oglas.tipHint === 'PLAC' ? (oglas.povrsinaPlaca ?? plac) : (plac ?? oglas.povrsinaPlaca),
    };
  },
};
