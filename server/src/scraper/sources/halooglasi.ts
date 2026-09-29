import * as cheerio from 'cheerio';
import { parseAreaField, toSquareMeters, type JedinicaPovrsine } from '../../domain/areas.js';
import { cleanWhitespace, normalizeText } from '../../domain/normalize.js';
import { normalizePrice, parsePriceText } from '../../domain/price.js';
import type { TipNekretnine } from '../../domain/constants.js';
import type { IzvorScraper, Pretraga, SiroviOglas } from '../types.js';
import { OPSTINE } from '../opstine.js';
import { absoluteUrl, extractJsonAfter, parseSerbianDate, setQueryParam } from '../utils.js';

const BASE = 'https://www.halooglasi.com';

// cena_d_unit=4 -> EUR
const pretrage: Pretraga[] = OPSTINE.flatMap((o) => [
  {
    naziv: `Halo - Kuće/vikendice ${o.naziv}`,
    url: `${BASE}/nekretnine/prodaja-kuca/${o.halo}?cena_d_to={kucaMaxCena}&cena_d_unit=4`,
    tip: 'KUCA' as const,
  },
  {
    naziv: `Halo - Placevi ${o.naziv}`,
    url: `${BASE}/nekretnine/prodaja-zemljista/${o.halo}?cena_d_to={placMaxCena}&cena_d_unit=4`,
    tip: 'PLAC' as const,
  },
]);

function unitFromHalo(u: string | undefined): JedinicaPovrsine {
  const t = normalizeText(u);
  if (t.startsWith('ar')) return 'ar';
  if (t.startsWith('ha')) return 'ha';
  if (t.startsWith('jut')) return 'jutro';
  return 'm2';
}

function tipFromHalo(value: string | null | undefined, fallback: TipNekretnine): TipNekretnine {
  const t = normalizeText(value);
  if (t.includes('vikend')) return 'VIKENDICA';
  if (t.includes('zemlji') || t.includes('plac')) return 'PLAC';
  if (t.includes('kuc')) return fallback === 'VIKENDICA' ? 'VIKENDICA' : 'KUCA';
  return fallback;
}

export const haloOglasi: IzvorScraper = {
  id: 'HALO',
  naziv: 'Halo Oglasi',
  pretrage,

  urlStrane: (url, strana) => setQueryParam(url, 'page', strana > 1 ? strana : null),

  parsirajListu(html, pretraga, ctx) {
    const $ = cheerio.load(html);
    const result: SiroviOglas[] = [];

    $('.product-item[data-id]').each((_, el) => {
      const item = $(el);
      const id = item.attr('data-id');
      const titleLink = item.find('h3.product-title a').first();
      const href = titleLink.attr('href');
      if (!id || !href) return;

      const priceSpan = item.find('.central-feature span[data-value]').first();
      const priceText = cleanWhitespace(priceSpan.text());
      const cena = priceSpan.attr('data-value')
        ? normalizePrice(priceSpan.attr('data-value')!, /din|rsd/i.test(priceText) ? 'RSD' : 'EUR', ctx.kursEurRsd)
        : parsePriceText(priceText, ctx.kursEurRsd);

      let povrsinaObjekta = null as number | null;
      let povrsinaPlaca = null as number | null;
      let tipTekst = null as string | null;
      item.find('.product-features li .value-wrapper').each((__, vw) => {
        const legend = normalizeText($(vw).find('.legend').text());
        const value = cleanWhitespace($(vw).clone().children('.legend').remove().end().text());
        if (legend.includes('tip nekretnine')) tipTekst = value;
        else if (legend.includes('placa')) povrsinaPlaca = parseAreaField(value, 'ar');
        else if (legend.includes('kvadratura')) povrsinaObjekta = parseAreaField(value);
        else if (legend === 'povrsina') povrsinaPlaca = parseAreaField(value, 'ar');
      });

      const lokacija = item
        .find('ul.subtitle-places li')
        .map((__, li) => cleanWhitespace($(li).text()))
        .get()
        .filter(Boolean)
        .join(' | ');

      result.push({
        izvor: 'HALO',
        izvorId: id,
        link: absoluteUrl(href.split('?')[0], BASE)!,
        naslov: cleanWhitespace(titleLink.text()),
        opis: cleanWhitespace(item.find('.short-desc, .product-description').first().text()),
        cena,
        tipHint: tipFromHalo(tipTekst, pretraga.tip),
        povrsinaObjekta: pretraga.tip === 'PLAC' ? null : povrsinaObjekta,
        povrsinaPlaca,
        lokacija,
        slika: item.find('.pi-img-wrapper img').first().attr('src') ?? null,
        objavljeno: parseSerbianDate(item.find('.publish-date').first().text()),
      });
    });

    return result;
  },

  parsirajDetalje(html, oglas, ctx) {
    const data = extractJsonAfter(html, 'QuidditaEnvironment.CurrentClassified=') as any;
    if (!data) return {};
    const f = data.OtherFields ?? {};
    const opis = data.TextHtml ? cleanWhitespace(cheerio.load(`<div>${data.TextHtml}</div>`)('div').text()) : null;
    const lokacija = [f.grad_s, f.lokacija_s, f.mikrolokacija_s, f.ulica_t].filter(Boolean).join(' | ');

    return {
      opis: opis ?? oglas.opis,
      lokacija: lokacija || oglas.lokacija,
      povrsinaPlaca:
        f.povrsina_placa_d != null
          ? toSquareMeters(Number(f.povrsina_placa_d), unitFromHalo(f.povrsina_placa_d_unit_s))
          : oglas.povrsinaPlaca,
      povrsinaObjekta: f.kvadratura_d != null ? Number(f.kvadratura_d) : oglas.povrsinaObjekta,
      cena: f.cena_d != null ? normalizePrice(Number(f.cena_d), f.cena_d_unit_s, ctx.kursEurRsd) : oglas.cena,
      tipHint: f.tip_nekretnine_s ? tipFromHalo(f.tip_nekretnine_s, oglas.tipHint ?? 'KUCA') : oglas.tipHint,
    };
  },
};
