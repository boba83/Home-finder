import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { GRUPE, IZVORI, STATUSI, TIPOVI } from '../domain/constants.js';

export const listingsRouter = Router();

const querySchema = z.object({
  grupa: z.enum(GRUPE).optional(),
  kategorija: z.enum(['PLAC', 'KUCE']).optional(),
  tip: z.enum(TIPOVI).optional(),
  izvor: z.union([z.enum(IZVORI), z.array(z.enum(IZVORI))]).optional(),
  status: z.union([z.enum(STATUSI), z.literal('SVI_VIDLJIVI'), z.literal('SVI')]).default('SVI_VIDLJIVI'),
  oznaka: z.enum(['aktivni', 'novo', 'omiljeno', 'arhivirano', 'svi']).default('aktivni'),
  sort: z.enum(['datum_desc', 'datum_asc', 'cena_asc', 'cena_desc', 'plac_desc', 'plac_asc']).default('datum_desc'),
  q: z.string().trim().max(100).optional(),
  maxCena: z.coerce.number().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

function buildWhere(q: z.infer<typeof querySchema>): Prisma.OglasWhereInput {
  const where: Prisma.OglasWhereInput = {};
  if (q.grupa) where.grupaLokacije = q.grupa;
  if (q.tip) where.tipNekretnine = q.tip;
  else if (q.kategorija === 'PLAC') where.tipNekretnine = 'PLAC';
  else if (q.kategorija === 'KUCE') where.tipNekretnine = { in: ['KUCA', 'VIKENDICA'] };
  if (q.izvor) where.izvor = { in: Array.isArray(q.izvor) ? q.izvor : [q.izvor] };

  if (q.status === 'SVI_VIDLJIVI') where.status = { in: ['ODOBREN', 'ZA_PROVERU'] };
  else if (q.status !== 'SVI') where.status = q.status;

  if (q.oznaka === 'aktivni') where.arhivirano = false;
  else if (q.oznaka === 'novo') Object.assign(where, { novo: true, arhivirano: false });
  else if (q.oznaka === 'omiljeno') where.omiljeno = true;
  else if (q.oznaka === 'arhivirano') where.arhivirano = true;

  if (q.maxCena) where.cena = { lte: q.maxCena };
  if (q.q) {
    where.OR = [{ naslov: { contains: q.q } }, { lokacija: { contains: q.q } }, { mesto: { contains: q.q } }, { opis: { contains: q.q } }];
  }
  return where;
}

const ORDER: Record<string, Prisma.OglasOrderByWithRelationInput[]> = {
  datum_desc: [{ pronadjeno: 'desc' }],
  datum_asc: [{ pronadjeno: 'asc' }],
  cena_asc: [{ cena: { sort: 'asc', nulls: 'last' } }, { pronadjeno: 'desc' }],
  cena_desc: [{ cena: { sort: 'desc', nulls: 'last' } }, { pronadjeno: 'desc' }],
  plac_desc: [{ povrsinaPlaca: { sort: 'desc', nulls: 'last' } }, { pronadjeno: 'desc' }],
  plac_asc: [{ povrsinaPlaca: { sort: 'asc', nulls: 'last' } }, { pronadjeno: 'desc' }],
};

listingsRouter.get('/', async (req, res) => {
  const q = querySchema.parse(req.query);
  const where = buildWhere(q);
  const [items, total] = await Promise.all([
    prisma.oglas.findMany({ where, orderBy: ORDER[q.sort], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.oglas.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

listingsRouter.get('/stats', async (_req, res) => {
  const vidljivi: Prisma.OglasWhereInput = { status: { in: ['ODOBREN', 'ZA_PROVERU'] }, arhivirano: false };
  const [matrica, poGrupi, poTipu, poIzvoru, novih, omiljenih, arhiviranih, zaProveru, odbijenih] = await Promise.all([
    prisma.oglas.groupBy({ by: ['grupaLokacije', 'tipNekretnine'], where: vidljivi, _count: true }),
    prisma.oglas.groupBy({ by: ['grupaLokacije'], where: vidljivi, _count: true }),
    prisma.oglas.groupBy({ by: ['tipNekretnine'], where: vidljivi, _count: true }),
    prisma.oglas.groupBy({ by: ['izvor'], where: vidljivi, _count: true }),
    prisma.oglas.count({ where: { ...vidljivi, novo: true } }),
    prisma.oglas.count({ where: { omiljeno: true } }),
    prisma.oglas.count({ where: { arhivirano: true, status: { in: ['ODOBREN', 'ZA_PROVERU'] } } }),
    prisma.oglas.count({ where: { ...vidljivi, status: 'ZA_PROVERU' } }),
    prisma.oglas.count({ where: { status: 'ODBIJEN' } }),
  ]);
  const toMap = (rows: Array<{ _count: number } & Record<string, any>>, key: string) =>
    Object.fromEntries(rows.map((r) => [r[key], r._count]));

  res.json({
    matrica: matrica.map((r) => ({ grupa: r.grupaLokacije, tip: r.tipNekretnine, broj: r._count })),
    poGrupi: toMap(poGrupi, 'grupaLokacije'),
    poTipu: toMap(poTipu, 'tipNekretnine'),
    poIzvoru: toMap(poIzvoru, 'izvor'),
    novih,
    omiljenih,
    arhiviranih,
    zaProveru,
    odbijenih,
  });
});

const patchSchema = z.object({
  omiljeno: z.boolean().optional(),
  arhivirano: z.boolean().optional(),
  novo: z.boolean().optional(),
});

listingsRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = patchSchema.parse(req.body);
  const updated = await prisma.oglas.update({ where: { id }, data });
  res.json(updated);
});

listingsRouter.post('/oznaci-pregledano', async (req, res) => {
  const ids = z.array(z.number().int()).optional().parse(req.body?.ids);
  const result = await prisma.oglas.updateMany({ where: { novo: true, ...(ids ? { id: { in: ids } } : {}) }, data: { novo: false } });
  res.json({ azurirano: result.count });
});
