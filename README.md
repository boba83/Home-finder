# Home Finder

Aplikacija koja automatski prati oglase za **placeve, kuće i vikendice na Fruškoj gori** na pet sajtova, filtrira ih po tvojim kriterijumima i šalje **push notifikaciju** čim se pojavi nov odgovarajući oglas.

| Sajt | Kako se čita |
| --- | --- |
| KupujemProdajem | JSON iz stranice (`__NEXT_DATA__`) |
| Halo Oglasi | HTML lista + JSON na stranici oglasa |
| Nekretnine.rs | JSON iz stranice (`__NEXT_DATA__`) |
| NadjiDom | HTML |
| Oglasi.rs | HTML (schema.org oznake) |

## Sadržaj

1. [Kako radi](#kako-radi)
2. [Pokretanje korak po korak](#pokretanje-korak-po-korak)
3. [Push notifikacije na telefonu (HTTPS)](#push-notifikacije-na-telefonu-https)
4. [Korisne komande](#korisne-komande)
5. [Konfiguracija (`server/.env`)](#konfiguracija-serverenv)
6. [Pravila filtriranja i lokacije](#pravila-filtriranja-i-lokacije)
7. [Anti-bot zaštite sajtova](#anti-bot-zaštite-sajtova)
8. [Struktura projekta](#struktura-projekta)
9. [Rešavanje problema](#rešavanje-problema)

---

## Kako radi

1. **Cron job** (podrazumevano na svakih 12 min, podesivo 5–59) pregleda liste oglasa sortirane od najnovijih za opštine Sremski Karlovci, Irig, Beočin, Inđija, Novi Sad i Sremska Mitrovica.
2. Za svaki oglas koji ranije nije viđen (**deduplikacija po URL-u i ID-u oglasa na sajtu**):
   - izvlači naslov, cenu (EUR, dinari se preračunavaju po kursu), tip, površinu objekta i placa, lokaciju, sliku i link;
   - određuje **grupu lokacije** (Zapadna / Istočna Fruška gora) prema listi mesta, bez obzira na dijakritike i ćirilicu;
   - ako plac nije naveden u listi, a cena može da prođe, otvara **stranicu oglasa** i čita površinu iz polja ili opisa;
   - proverava **filter** i snima oglas sa statusom `ODOBREN`, `ZA_PROVERU` ili `ODBIJEN`.
3. Za svaki novi odobren oglas šalje se **Web Push** svim uređajima koji su izabrali tu grupu i kategoriju.
4. Skeniranje po strani staje čim naiđe na stranu na kojoj su svi oglasi već poznati — redovna skeniranja zato traju kratko.

Oglasi van ciljnih mesta se ne čuvaju, samo se pamti da su viđeni (da se ne bi ponovo proveravali). Odbijeni oglasi se čuvaju skriveni: kada promeniš filtere u Podešavanjima, svi se **ponovo procenjuju** i oni koji sada odgovaraju pojavljuju se u feedu.

## Pokretanje korak po korak

### 1. Preduslovi

- **Node.js 20.19+ ili 22+** — preuzmi sa <https://nodejs.org> (LTS). Proveri u terminalu:
  ```bash
  node -v
  npm -v
  ```
- **Git** (opciono, za kloniranje).

Sve ostalo (baza SQLite, TypeScript…) instalira se kroz npm — ne treba poseban server baze.

### 2. Preuzmi projekat i instaliraj zavisnosti

```bash
cd home-finder
npm install
```

Ovo instalira zavisnosti i za `server` i za `client` (npm workspaces).

### 3. Napravi konfiguracioni fajl

Windows (PowerShell):

```powershell
Copy-Item server\.env.example server\.env
```

macOS / Linux:

```bash
cp server/.env.example server/.env
```

Otvori `server/.env` i upiši svoj e-mail u `VAPID_SUBJECT` (npr. `mailto:ime@gmail.com`). Ostale vrednosti mogu da ostanu podrazumevane.

### 4. Generiši ključeve za push notifikacije

```bash
npm run vapid
```

Komanda upisuje `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY` u `server/.env`. Uradi ovo **jednom** — ako kasnije promeniš ključeve, svi uređaji moraju ponovo da uključe notifikacije.

### 5. Napravi bazu

```bash
npm run db:setup -w server
```

Pravi SQLite bazu `server/prisma/dev.db`, tabele i podrazumevana podešavanja.

> Koraci 2 i 5 zajedno: `npm run setup`.

### 6. Pokreni aplikaciju

```bash
npm run dev
```

- Dashboard: **<http://localhost:5817>**
- API: <http://localhost:4817/api>

Prvo skeniranje kreće automatski 3 sekunde posle starta (`SCRAPE_ON_START=true`). Prvo skeniranje traje duže (nekoliko minuta), jer su pauze između zahteva namerno nasumične i duge (4–9 s po sajtu). Napredak se vidi u zaglavlju feeda i na strani **Podešavanja → Status skeniranja**.

### 7. Uključi notifikacije

Otvori **Notifikacije** → izaberi grupe (Zapadna / Istočna FG) i kategorije → **Uključi notifikacije** → dozvoli obaveštenja u browseru → **Pošalji test**.

Na računaru ovo radi odmah na `localhost`. Za telefon pogledaj sledeći odeljak.

### 8. Trajno pokretanje (produkcioni režim)

```bash
npm run build
npm start
```

Server tada na jednoj adresi, **<http://localhost:4817>**, služi i API i dashboard. Računar mora biti uključen da bi skeniranje radilo. Za automatski start posle restarta možeš koristiti [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start npm --name home-finder -- start
pm2 save
```

## Push notifikacije na telefonu (HTTPS)

Browseri dozvoljavaju Web Push samo na **HTTPS** adresama (izuzetak je `localhost`). Kada otvoriš `http://192.168.x.x:5817` na telefonu, push **neće** raditi. Najlakše rešenje je besplatan tunel:

1. Pokreni aplikaciju u produkcionom režimu (`npm run build` pa `npm start`) — tako je sve na portu 4817.
2. Instaliraj [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) i pokreni:
   ```bash
   cloudflared tunnel --url http://localhost:4817
   ```
   ili [ngrok](https://ngrok.com/download): `ngrok http 4817`
3. Dobićeš adresu tipa `https://nesto-nesto.trycloudflare.com` — otvori je na telefonu.
4. **Android (Chrome):** Notifikacije → Uključi notifikacije. Po želji: meni ⋮ → *Dodaj na početni ekran*.
5. **iPhone (iOS 16.4+):** otvori adresu u **Safariju** → *Podeli* → **Dodaj na početni ekran** → otvori Home Finder sa početnog ekrana → Notifikacije → Uključi. Na iPhone-u push radi *samo* iz aplikacije dodate na početni ekran.

> Besplatni `trycloudflare` tunel dobija novu adresu pri svakom pokretanju, a pretplata je vezana za adresu. Za stalnu adresu koristi imenovani Cloudflare tunel ili statički ngrok domen. Kada se adresa promeni, ponovo uključi notifikacije na telefonu.

## Korisne komande

Sve se pokreću iz korenskog foldera projekta.

| Komanda | Opis |
| --- | --- |
| `npm run dev` | Server (sa auto-restartom) + Vite dev server |
| `npm run build` / `npm start` | Produkcioni build i pokretanje (port 4817) |
| `npm run scrape` | Jedno skeniranje iz terminala, uz tabelu rezultata po sajtu |
| `npm run scrape -- KP HALO` | Skeniranje samo izabranih izvora (`KP`, `HALO`, `NEKRETNINE`, `NADJIDOM`, `OGLASI`) |
| `npm run scrape -- --duboko` | Duboko skeniranje (do 25 strana po pretrazi) — za prvo punjenje baze |
| `npm run probe -w server -- NADJIDOM --detalji` | Test parsera bez upisa u bazu: ispisuje šta je pročitano sa sajta |
| `npm test` | Testovi filtera, lokacija i parsiranja površina (vitest) |
| `npm run db:studio -w server` | Prisma Studio — pregled i izmena baze u browseru |
| `npm run vapid` | Generisanje VAPID ključeva (`-- --force` za nove) |

## Konfiguracija (`server/.env`)

| Promenljiva | Podrazumevano | Opis |
| --- | --- | --- |
| `PORT` | `4817` | Port API-ja |
| `DATABASE_URL` | `file:./dev.db` | SQLite fajl (relativno u odnosu na `server/prisma/`) |
| `CLIENT_ORIGIN` | `http://localhost:5817` | Dozvoljeni CORS origin u dev režimu |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | Ključevi za Web Push (`npm run vapid`) |
| `VAPID_SUBJECT` | `mailto:...` | Kontakt za push servise |
| `SCRAPER_MIN_DELAY_MS` / `SCRAPER_MAX_DELAY_MS` | `4000` / `9000` | Nasumična pauza između dva zahteva ka istom sajtu |
| `SCRAPER_MAX_RETRIES` | `3` | Broj pokušaja kod grešaka 429/5xx |
| `SCRAPER_TIMEOUT_MS` | `30000` | Timeout zahteva |
| `SCRAPE_ON_START` | `true` | Skeniranje odmah po pokretanju servera |

Sve ostalo se menja **u aplikaciji** (Podešavanja), bez izmene koda i bez restarta:

- limiti za placeve i kuće,
- šta raditi sa oglasima bez placa ili bez cene,
- kurs EUR/RSD,
- interval skeniranja, broj strana i aktivni sajtovi,
- URL-ovi pretraga po sajtu (napredno — npr. dodavanje nove opštine). U URL-u možeš koristiti `{placMaxCena}` i `{kucaMaxCena}`.

## Pravila filtriranja i lokacije

**Plac** — površina **500–7000 m²** i cena **≤ 26.000 €**.

**Kuća / vikendica** — cena **≤ 70.000 €** i plac **≥ 700 m²**. Kuća bez navedene površine placa (ni u polju ni u opisu) dobija status **Za proveru** (ili se odbacuje, ako to isključiš u Podešavanjima). Kuća sa premalim placem se odbacuje.

Oglas bez cene („na upit”) dobija status **Za proveru** (podesivo).

Površina placa se čita iz strukturisanog polja sajta, a ako ga nema, iz naslova i opisa („plac 12 ari”, „na placu od 1.200 m²”, „0,5 ha”, „7 jutara”…). Ari, hektari i jutra se preračunavaju u m².

**Zapadna Fruška gora (ZAPADNA_FG):** Banstol, Maradik, Velika Remeta, Krušedol, Grgeteg, Sremski Karlovci, Srednji Matej, Pučkaroš, Vizirac.

**Istočna Fruška gora (ISTOCNA_FG):** Glavica, Bocke, Stari Ledinci, Rakovac, Dumbovo, Banoštor, Grabovo, Lug, Šusek, Koruška, Sviloš, Ležimir.

Poređenje ignoriše dijakritike, velika i mala slova i ćirilicu, a prepoznaje i padeže („u Rakovcu”, „kod Krušedola”, „Bocke / Bockama”). Mesto se traži redom u polju lokacije, naslovu i opisu. Konkretno selo ima prednost nad Sremskim Karlovcima (npr. „Sremski Karlovci – Banstol” → Banstol).

Ako je mesto pronađeno **samo u opisu** (npr. „plac u Neradinu, 10 min do Banstola”), oglas koji inače ispunjava kriterijume dobija status **Za proveru** umesto Odobren, jer nekretnina može biti u susednom selu.

## Anti-bot zaštite sajtova

Sajtovi koriste Cloudflare i DataDome zaštitu. Scraper se trudi da bude „pristojan”:

- zahtevi ka istom sajtu idu **jedan po jedan**, sa nasumičnom pauzom od 4–9 s (za Nekretnine.rs i Halo pauza je duža);
- šalju se zaglavlja pravog browsera, a kolačići se čuvaju po sajtu;
- stranice oglasa se otvaraju samo kada su zaista potrebne;
- kada sajt vrati captcha / anti-bot stranu, taj sajt se **pauzira** (1 h, pa 2 h, 4 h… do 12 h) i ne pokušava se ponovo odmah. Pauze su prikazane u *Podešavanja → Status skeniranja*.

**Nekretnine.rs** (DataDome) najstrože ograničava broj zahteva. Ako se tvoja IP adresa „zapamti”, sajt je nedostupan za scraping nekoliko sati. Aplikacija tada nastavlja sa ostala četiri sajta. Ne smanjuj pauze u `.env` ispod podrazumevanih vrednosti.

## Struktura projekta

```
home-finder/
├── package.json              # npm workspaces + zajedničke skripte
├── server/                   # Node.js + TypeScript + Express + Prisma
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma     # Oglas, VidjenOglas, Podesavanja, PushPretplata, SkeniranjeLog
│   │   └── seed.ts
│   ├── scripts/              # generate-vapid, run-once (scrape), probe
│   ├── src/
│   │   ├── index.ts          # Express app + start scheduler-a
│   │   ├── domain/           # normalizacija, lokacije, površine, cene, tip, FILTER
│   │   ├── scraper/
│   │   │   ├── http.ts       # rate limiter, pauze, kolačići, anti-bot detekcija
│   │   │   ├── runner.ts     # tok skeniranja, deduplikacija, validacija, upis
│   │   │   └── sources/      # parseri: kupujemprodajem, halooglasi, nekretnine, nadjidom, oglasi
│   │   ├── services/         # settings, push (web-push), scheduler (raspored skeniranja)
│   │   └── routes/           # /api/listings, /api/settings, /api/push, /api/scrape
│   └── tests/                # vitest
└── client/                   # React + Vite + Tailwind + shadcn/ui
    ├── public/sw.js          # service worker za push
    └── src/
        ├── pages/            # FeedPage, SettingsPage, NotificationsPage
        ├── components/       # Layout, ListingCard, ui/ (shadcn komponente)
        └── lib/              # api, push, types, format
```

### Glavna polja modela `Oglas`

| Polje | Opis |
| --- | --- |
| `izvor` | `KP`, `HALO`, `NEKRETNINE`, `NADJIDOM`, `OGLASI` |
| `izvorId`, `link` | ID na sajtu i URL — oba su jedinstvena (deduplikacija) |
| `cena` | cena u EUR (`null` = na upit) |
| `tipNekretnine` | `PLAC`, `KUCA`, `VIKENDICA` |
| `povrsinaObjekta`, `povrsinaPlaca` | u m² |
| `lokacija`, `mesto`, `grupaLokacije` | originalna lokacija, prepoznato mesto, `ZAPADNA_FG` / `ISTOCNA_FG` |
| `status`, `razlogStatusa` | `ODOBREN` / `ZA_PROVERU` / `ODBIJEN` i objašnjenje |
| `novo`, `omiljeno`, `arhivirano` | oznake iz dashboarda |

## Rešavanje problema

**`npm install` javlja `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN`**
Mreža (antivirus, firmin proxy) presreće HTTPS. Izvezi korenske sertifikate u PEM fajl i reci Node-u da ih koristi — nemoj isključivati proveru sertifikata:

```powershell
$pem = "$env:USERPROFILE\win-root-ca.pem"
Get-ChildItem Cert:\LocalMachine\Root | ForEach-Object {
  "-----BEGIN CERTIFICATE-----"
  [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks')
  "-----END CERTIFICATE-----"
} | Set-Content -Encoding ascii $pem
$env:NODE_EXTRA_CA_CERTS = $pem
$env:npm_config_cafile = $pem
npm install
```

Ista promenljiva `NODE_EXTRA_CA_CERTS` mora biti postavljena i kada se pokreće server, jer i scraper pravi HTTPS zahteve. Za trajno podešavanje pokreni `setx NODE_EXTRA_CA_CERTS "%USERPROFILE%\win-root-ca.pem"`.

**Dugme „Uključi notifikacije” je sivo**
Proveri da li je pokrenut `npm run vapid` i restartovan server, da li si na HTTPS adresi ili `localhost`, i da obaveštenja nisu blokirana u podešavanjima sajta.

**Nema oglasa posle skeniranja**
Pogledaj *Podešavanja → Status skeniranja* (greške po sajtu) ili pokreni `npm run scrape` i proveri tabelu. Prebaci status filter u feedu na „Odbijeni” da vidiš šta je odbačeno i zašto. Pokreni i duboko skeniranje (`npm run scrape -- --duboko`) za prvo punjenje.

**Sajt je promenio izgled i parser više ne radi**
`npm run probe -w server -- IME_IZVORA --detalji` pokazuje šta parser čita. Parseri su u `server/src/scraper/sources/`, po jedan fajl za svaki sajt.

**Resetovanje baze**
Zaustavi server, obriši `server/prisma/dev.db` i ponovo pokreni `npm run db:setup -w server`.
