import type { Izvor } from '../../domain/constants.js';
import type { IzvorScraper } from '../types.js';
import { haloOglasi } from './halooglasi.js';
import { kupujemProdajem } from './kupujemprodajem.js';
import { nadjiDom } from './nadjidom.js';
import { nekretnineRs } from './nekretnine.js';
import { oglasiRs } from './oglasi.js';

export const SCRAPERI: Record<Izvor, IzvorScraper> = {
  KP: kupujemProdajem,
  HALO: haloOglasi,
  NEKRETNINE: nekretnineRs,
  NADJIDOM: nadjiDom,
  OGLASI: oglasiRs,
};
