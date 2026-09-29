export const IZVORI = ['KP', 'HALO', 'NEKRETNINE', 'NADJIDOM', 'OGLASI'] as const;
export type Izvor = (typeof IZVORI)[number];

export const IZVOR_NAZIV: Record<Izvor, string> = {
  KP: 'KupujemProdajem',
  HALO: 'Halo Oglasi',
  NEKRETNINE: 'Nekretnine.rs',
  NADJIDOM: 'NadjiDom',
  OGLASI: 'Oglasi.rs',
};

export const TIPOVI = ['PLAC', 'KUCA', 'VIKENDICA'] as const;
export type TipNekretnine = (typeof TIPOVI)[number];

export const GRUPE = ['ZAPADNA_FG', 'ISTOCNA_FG'] as const;
export type GrupaLokacije = (typeof GRUPE)[number];

export const GRUPA_NAZIV: Record<GrupaLokacije, string> = {
  ZAPADNA_FG: 'Zapadna Fruška gora',
  ISTOCNA_FG: 'Istočna Fruška gora',
};

export const STATUSI = ['ODOBREN', 'ZA_PROVERU', 'ODBIJEN'] as const;
export type StatusOglasa = (typeof STATUSI)[number];
