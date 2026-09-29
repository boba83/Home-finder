import { describe, expect, it } from 'vitest';
import { classifyLocation } from '../src/domain/locations.js';
import { normalizeText } from '../src/domain/normalize.js';

describe('normalizeText', () => {
  it('uklanja dijakritike i prevodi ćirilicu', () => {
    expect(normalizeText('Krušedol')).toBe('krusedol');
    expect(normalizeText('Крушедол')).toBe('krusedol');
    expect(normalizeText('LEŽIMIR, Sviloš')).toBe('lezimir svilos');
  });
});

describe('classifyLocation', () => {
  it('prepoznaje mesta bez obzira na dijakritike', () => {
    expect(classifyLocation({ lokacija: 'Irig | Okolno mesto | Krusedol' })).toMatchObject({ mesto: 'Krušedol', grupa: 'ZAPADNA_FG' });
    expect(classifyLocation({ lokacija: 'Irig | Okolno mesto | Krušedol' })).toMatchObject({ mesto: 'Krušedol', grupa: 'ZAPADNA_FG' });
    expect(classifyLocation({ lokacija: 'Beočin | Banoštor' })).toMatchObject({ mesto: 'Banoštor', grupa: 'ISTOCNA_FG' });
    expect(classifyLocation({ naslov: 'Vikendica, Sviloš' })).toMatchObject({ mesto: 'Sviloš', grupa: 'ISTOCNA_FG' });
  });

  it('prepoznaje padeže u naslovu i opisu', () => {
    expect(classifyLocation({ naslov: 'Prelepa vikendica na Banstolu' })).toMatchObject({ mesto: 'Banstol' });
    expect(classifyLocation({ opis: 'Plac u Rakovcu, struja i voda' })).toMatchObject({ mesto: 'Rakovac', grupa: 'ISTOCNA_FG' });
    expect(classifyLocation({ opis: 'Kuća u Sremskim Karlovcima' })).toMatchObject({ mesto: 'Sremski Karlovci', grupa: 'ZAPADNA_FG' });
    expect(classifyLocation({ naslov: 'Plac Stari Ledinci 10 ari' })).toMatchObject({ mesto: 'Stari Ledinci', grupa: 'ISTOCNA_FG' });
  });

  it('selo iz naslova ima prednost nad gradom iz lokacije', () => {
    expect(
      classifyLocation({ lokacija: 'Sremski Karlovci | Okolno mesto | Fruška Gora', naslov: 'Prelepa Vikendica Na Banstolu' }),
    ).toMatchObject({ mesto: 'Banstol', izvorPodatka: 'lokacija' });
  });

  it('vraća null za mesta van liste', () => {
    expect(classifyLocation({ lokacija: 'Pećinci | Okolno mesto | Popinci', naslov: 'Kuća Popinci' })).toBeNull();
    expect(classifyLocation({ lokacija: 'Novi Sad | Liman' })).toBeNull();
  });

  it('razlikuje Novi Karlovci / Novi Ledinci od traženih mesta', () => {
    expect(classifyLocation({ naslov: 'Njiva prve klase - Novi Karlovci' })).toBeNull();
    expect(classifyLocation({ lokacija: 'Novi Ledinci' })).toBeNull();
    expect(classifyLocation({ lokacija: 'Ledinci' })).toMatchObject({ mesto: 'Stari Ledinci' });
  });

  it('ne pravi lažna poklapanja unutar drugih reči', () => {
    expect(classifyLocation({ naslov: 'Kuća u Lugavčini' })).toBeNull();
    expect(classifyLocation({ naslov: 'Glavičica' })).toBeNull();
  });
});
