import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { GRUPE, TIPOVI } from '../domain/constants.js';
import { pushEnabled, sendTestNotification } from '../services/push.js';

export const pushRouter = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const preferencesSchema = z.object({
  grupe: z.array(z.enum(GRUPE)),
  kategorije: z.array(z.enum(TIPOVI)),
  zaProveru: z.boolean(),
});

pushRouter.get('/config', (_req, res) => {
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? config.vapid.publicKey : null });
});

pushRouter.post('/subscribe', async (req, res) => {
  const body = z
    .object({ subscription: subscriptionSchema, preferences: preferencesSchema.partial().optional(), uredjaj: z.string().max(200).optional() })
    .parse(req.body);
  const prefs = body.preferences ?? {};
  const data = {
    p256dh: body.subscription.keys.p256dh,
    auth: body.subscription.keys.auth,
    uredjaj: body.uredjaj ?? null,
    ...(prefs.grupe ? { grupe: JSON.stringify(prefs.grupe) } : {}),
    ...(prefs.kategorije ? { kategorije: JSON.stringify(prefs.kategorije) } : {}),
    ...(prefs.zaProveru !== undefined ? { zaProveru: prefs.zaProveru } : {}),
  };
  const sub = await prisma.pushPretplata.upsert({
    where: { endpoint: body.subscription.endpoint },
    create: { endpoint: body.subscription.endpoint, ...data },
    update: data,
  });
  res.json({ id: sub.id });
});

pushRouter.post('/preferences', async (req, res) => {
  const body = preferencesSchema.extend({ endpoint: z.string().url() }).parse(req.body);
  const sub = await prisma.pushPretplata.update({
    where: { endpoint: body.endpoint },
    data: { grupe: JSON.stringify(body.grupe), kategorije: JSON.stringify(body.kategorije), zaProveru: body.zaProveru },
  });
  res.json({ id: sub.id });
});

pushRouter.post('/status', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
  const sub = await prisma.pushPretplata.findUnique({ where: { endpoint } });
  if (!sub) {
    res.json({ subscribed: false });
    return;
  }
  res.json({
    subscribed: true,
    preferences: { grupe: JSON.parse(sub.grupe), kategorije: JSON.parse(sub.kategorije), zaProveru: sub.zaProveru },
  });
});

pushRouter.post('/unsubscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
  await prisma.pushPretplata.deleteMany({ where: { endpoint } });
  res.json({ ok: true });
});

pushRouter.post('/test', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url().optional() }).parse(req.body ?? {});
  const sent = await sendTestNotification(endpoint);
  res.json({ poslato: sent });
});
