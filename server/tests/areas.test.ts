import { describe, expect, it } from 'vitest';
import { extractBuildingAreaFromText, extractPlotAreaFromText, parseAreaField } from '../src/domain/areas.js';
import { parseLocaleNumber } from '../src/domain/normalize.js';
import { parsePriceText } from '../src/domain/price.js';

describe('parseLocaleNumber', () => {
  it('parsira srpske formate brojeva', () => {
    expect(parseLocaleNumber('45.000')).toBe(45000);
    expect(parseLocaleNumber('1.200.000')).toBe(1200000);
    expect(parseLocaleNumber('17,18')).toBe(17.18);
    expect(parseLocaleNumber('309.000,00')).toBe(309000);
    expect(parseLocaleNumber('309000.00')).toBe(309000);
    expect(parseLocaleNumber('0.5')).toBe(0.5);
  });
});

describe('parseAreaField', () => {
  it('pretvara jedinice u m²', () => {
    expect(parseAreaField('25 ari')).toBe(2500);
    expect(parseAreaField('4.49 ara')).toBe(449);
    expect(parseAreaField('11,4 a')).toBe(1140);
    expect(parseAreaField('991m2')).toBe(991);
    expect(parseAreaField('230,40 ari')).toBe(23040);
    expect(parseAreaField('1,5 ha')).toBe(15000);
    expect(parseAreaField('1.439 m²')).toBe(1439);
  });
  it('koristi podrazumevanu jedinicu kada nije navedena', () => {
    expect(parseAreaField('13', 'ar')).toBe(1300);
  });
  it('ispravlja očigledne greške u jedinici ("1773 ari" za vikendicu)', () => {
    expect(parseAreaField('1773 ari')).toBe(1773);
  });
});

describe('extractPlotAreaFromText', () => {
  it('pronalazi površinu placa u opisu', () => {
    expect(extractPlotAreaFromText('Kuća 80m2 na placu od 10 ari, struja, voda')).toBe(1000);
    expect(extractPlotAreaFromText('Plac Banstol površina 1439m2 građevinsko zemljište')).toBe(1439);
    expect(extractPlotAreaFromText('Uknjiženo. 110 kv kuća i 90 kv pomoćni objekat. Plac 25 ari.')).toBe(2500);
    expect(extractPlotAreaFromText('Vikendica sa okućnicom od 0,5 ha')).toBe(5000);
  });
  it('ne tumači površinu kuće kao plac', () => {
    expect(extractPlotAreaFromText('Kuća od 120 m2, tri sobe, renovirana')).toBeNull();
  });
});

describe('extractBuildingAreaFromText', () => {
  it('pronalazi kvadraturu objekta', () => {
    expect(extractBuildingAreaFromText('Kuća 80m2 na placu od 10 ari')).toBe(80);
  });
});

describe('parsePriceText', () => {
  it('parsira cene u EUR i RSD', () => {
    expect(parsePriceText('45.000 €', 117.2)).toBe(45000);
    expect(parsePriceText('309.000,00 EUR', 117.2)).toBe(309000);
    expect(parsePriceText('2.344.000 din', 117.2)).toBe(20000);
    expect(parsePriceText('Dogovor', 117.2)).toBeNull();
    expect(parsePriceText('1 €', 117.2)).toBeNull();
  });
});
