import { describe, expect, it } from 'vitest';
import { evaluateListing, PODRAZUMEVANA_PRAVILA as P } from '../src/domain/filter.js';

describe('PLAC: 500-7000 m², do 26.000 €', () => {
  it('prihvata plac u opsegu', () => {
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 16500, povrsinaPlaca: 1300 }, P).status).toBe('ODOBREN');
  });
  it('prihvata granične vrednosti (500 m², 7000 m², 26.000 €)', () => {
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 26000, povrsinaPlaca: 500 }, P).status).toBe('ODOBREN');
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 26000, povrsinaPlaca: 7000 }, P).status).toBe('ODOBREN');
  });
  it('odbija preskup plac', () => {
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 26001, povrsinaPlaca: 1000 }, P).status).toBe('ODBIJEN');
  });
  it('odbija premali i preveliki plac', () => {
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 10000, povrsinaPlaca: 499 }, P).status).toBe('ODBIJEN');
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 10000, povrsinaPlaca: 7001 }, P).status).toBe('ODBIJEN');
  });
  it('plac bez površine ide na proveru', () => {
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 10000, povrsinaPlaca: null }, P).status).toBe('ZA_PROVERU');
  });
});

describe('KUĆA / VIKENDICA: do 70.000 €, plac >= 700 m²', () => {
  it('prihvata kuću sa dovoljnim placem', () => {
    expect(evaluateListing({ tipNekretnine: 'KUCA', cena: 70000, povrsinaPlaca: 700 }, P).status).toBe('ODOBREN');
    expect(evaluateListing({ tipNekretnine: 'VIKENDICA', cena: 35000, povrsinaPlaca: 2500 }, P).status).toBe('ODOBREN');
  });
  it('odbija preskupu kuću', () => {
    expect(evaluateListing({ tipNekretnine: 'KUCA', cena: 70001, povrsinaPlaca: 2000 }, P).status).toBe('ODBIJEN');
  });
  it('odbija kuću sa placem manjim od 700 m²', () => {
    const r = evaluateListing({ tipNekretnine: 'VIKENDICA', cena: 30000, povrsinaPlaca: 699 }, P);
    expect(r.status).toBe('ODBIJEN');
    expect(r.razlog).toContain('manji');
  });
  it('kuća bez navedenog placa: "Za proveru" ili odbijena, zavisno od podešavanja', () => {
    expect(evaluateListing({ tipNekretnine: 'KUCA', cena: 50000, povrsinaPlaca: null }, P).status).toBe('ZA_PROVERU');
    expect(
      evaluateListing({ tipNekretnine: 'KUCA', cena: 50000, povrsinaPlaca: null }, { ...P, kuceBezPlacaZaProveru: false }).status,
    ).toBe('ODBIJEN');
  });
  it('poštuje izmenjena pravila (npr. 30.000 € za plac)', () => {
    const rules = { ...P, placMaxCena: 30000 };
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 28000, povrsinaPlaca: 1000 }, rules).status).toBe('ODOBREN');
  });
});

describe('Lokacija pronađena samo u opisu', () => {
  it('oglas koji ispunjava kriterijume ide na proveru', () => {
    const r = evaluateListing({ tipNekretnine: 'PLAC', cena: 8500, povrsinaPlaca: 1150, lokacijaIzOpisa: true, mesto: 'Banstol' }, P);
    expect(r.status).toBe('ZA_PROVERU');
    expect(r.razlog).toContain('Banstol');
  });
  it('odbijen oglas ostaje odbijen', () => {
    expect(evaluateListing({ tipNekretnine: 'PLAC', cena: 30000, povrsinaPlaca: 1150, lokacijaIzOpisa: true }, P).status).toBe('ODBIJEN');
  });
});
