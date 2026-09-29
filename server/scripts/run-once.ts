import { prisma } from '../src/db.js';
import { IZVORI, type Izvor } from '../src/domain/constants.js';
import { runScrape } from '../src/scraper/runner.js';

// Upotreba: npm run scrape            -> svi aktivni izvori
//           npm run scrape -- KP HALO -> samo navedeni izvori
//           npm run scrape -- --duboko -> više strana po pretrazi (inicijalno punjenje baze)
const args = process.argv.slice(2);
const izvori = args.filter((a): a is Izvor => (IZVORI as readonly string[]).includes(a.toUpperCase())).map((a) => a.toUpperCase() as Izvor);

const result = await runScrape({ duboko: args.includes('--duboko'), izvori: izvori.length ? izvori : undefined });
if (result) {
  console.table(
    Object.fromEntries(
      Object.entries(result.poIzvoru).map(([k, s]) => [
        k,
        { pregledano: s!.pregledano, novih: s!.novih, odobrenih: s!.odobrenih, zaProveru: s!.zaProveru, odbijenih: s!.odbijenih, detalja: s!.detaljnihStrana, gresaka: s!.greske.length },
      ]),
    ),
  );
  for (const [k, s] of Object.entries(result.poIzvoru)) for (const g of s!.greske) console.warn(`[${k}] ${g}`);
}
await prisma.$disconnect();
