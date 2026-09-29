// Dijagnostika parsera bez upisa u bazu: preuzima prvu stranu pretraga i ispisuje šta je parser pronašao.
// Upotreba: npm run probe                -> prva pretraga svakog izvora
//           npm run probe -- HALO --all  -> sve pretrage izabranog izvora
//           npm run probe -- KP --detalji -> otvara i stranicu prvog oglasa
import { IZVORI, type Izvor } from '../src/domain/constants.js';
import { PODRAZUMEVANA_PRAVILA } from '../src/domain/filter.js';
import { classifyLocation } from '../src/domain/locations.js';
import { fetchHtml } from '../src/scraper/http.js';
import { SCRAPERI } from '../src/scraper/sources/index.js';

const args = process.argv.slice(2);
const izvori = args.map((a) => a.toUpperCase()).filter((a): a is Izvor => (IZVORI as readonly string[]).includes(a));
const all = args.includes('--all');
const detalji = args.includes('--detalji');
const ctx = { kursEurRsd: 117.2 };

const fill = (url: string) =>
  url.replaceAll('{placMaxCena}', String(PODRAZUMEVANA_PRAVILA.placMaxCena)).replaceAll('{kucaMaxCena}', String(PODRAZUMEVANA_PRAVILA.kucaMaxCena));

await Promise.all(
  (izvori.length ? izvori : [...IZVORI]).map(async (id) => {
    const scraper = SCRAPERI[id];
    const pretrage = all ? scraper.pretrage : scraper.pretrage.slice(0, 1);
    for (const p of pretrage) {
      const url = scraper.urlStrane(fill(p.url), 1);
      try {
        const res = await fetchHtml(url, { allowStatus: [404] });
        const lista = res.status === 404 ? [] : scraper.parsirajListu(res.html, p, ctx);
        const lines = [`\n=== ${p.naziv} | HTTP ${res.status} | ${lista.length} oglasa\n${url}`];
        for (const o of lista.slice(0, 5)) {
          const loc = classifyLocation(o);
          lines.push(
            `  - [${o.izvorId}] ${o.naslov.slice(0, 70)}\n    cena=${o.cena ?? '?'}€ objekat=${o.povrsinaObjekta ?? '?'}m² plac=${o.povrsinaPlaca ?? '?'}m² lokacija="${o.lokacija}" -> ${loc ? `${loc.mesto} (${loc.grupa})` : 'van ciljanih mesta'}`,
          );
        }
        if (detalji && lista[0] && scraper.parsirajDetalje) {
          const d = await fetchHtml(lista[0].link);
          const det = scraper.parsirajDetalje(d.html, lista[0], ctx);
          lines.push(`  DETALJI ${lista[0].link}\n    ${JSON.stringify({ ...det, opis: det.opis?.slice(0, 160) })}`);
        }
        console.log(lines.join('\n'));
      } catch (err) {
        console.log(`\n=== ${p.naziv} | GREŠKA: ${(err as Error).message}\n${url}`);
      }
    }
  }),
);
