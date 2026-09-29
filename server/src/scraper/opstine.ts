/**
 * Opštine koje pokrivaju sva tražena mesta:
 * - Sremski Karlovci: Sremski Karlovci, Banstol, Pučkaroš, Vizirac, Srednji Matej
 * - Irig: Krušedol, Grgeteg, Velika Remeta
 * - Inđija: Maradik
 * - Beočin: Rakovac, Dumbovo, Banoštor, Grabovo, Lug, Šusek, Sviloš, Koruška
 * - Novi Sad (Petrovaradin): Bocke, Stari Ledinci, Glavica
 * - Sremska Mitrovica: Ležimir
 *
 * Slug-ovi su specifični za svaki sajt (provereno na sajtovima).
 */
export interface Opstina {
  naziv: string;
  halo: string;
  nekretnine: string;
  oglasi: string;
  nadjidom: string;
}

export const OPSTINE: Opstina[] = [
  { naziv: 'Sremski Karlovci', halo: 'sremski-karlovci', nekretnine: 'sremski-karlovci', oglasi: 'sremski-karlovci', nadjidom: 'Sremski+Karlovci' },
  { naziv: 'Irig', halo: 'irig', nekretnine: 'irig', oglasi: 'irig', nadjidom: 'Irig' },
  { naziv: 'Beočin', halo: 'beocin', nekretnine: 'beocin', oglasi: 'beocin', nadjidom: 'Beocin' },
  { naziv: 'Inđija', halo: 'indjija', nekretnine: 'indjija', oglasi: 'indjija', nadjidom: 'Indjija' },
  { naziv: 'Novi Sad', halo: 'novi-sad', nekretnine: 'novi-sad', oglasi: 'novi-sad', nadjidom: 'Novi+Sad' },
  { naziv: 'Sremska Mitrovica', halo: 'sremska-mitrovica', nekretnine: 'sremska-mitrovica', oglasi: 'sremska-mitrovica', nadjidom: 'Sremska+Mitrovica' },
];
