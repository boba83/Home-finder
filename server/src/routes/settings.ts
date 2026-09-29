import { Router } from 'express';
import { IZVORI, IZVOR_NAZIV } from '../domain/constants.js';
import { reevaluateAll } from '../scraper/runner.js';
import { SCRAPERI } from '../scraper/sources/index.js';
import { startScheduler } from '../services/scheduler.js';
import { getSettings, settingsUpdateSchema, updateSettings } from '../services/settings.js';

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put('/', async (req, res) => {
  const input = settingsUpdateSchema.parse(req.body);
  const settings = await updateSettings(input);
  // Promena pravila -> postojeći oglasi se ponovo ocenjuju (odbijeni mogu postati odobreni i obrnuto)
  const { promenjeno } = await reevaluateAll();
  await startScheduler();
  res.json({ settings, promenjenoOglasa: promenjeno });
});

/** Podrazumevane pretrage po izvoru (za prikaz i vraćanje na podrazumevano u podešavanjima) */
settingsRouter.get('/izvori', (_req, res) => {
  res.json(
    IZVORI.map((id) => ({
      id,
      naziv: IZVOR_NAZIV[id],
      podrazumevanePretrage: SCRAPERI[id].pretrage,
    })),
  );
});
