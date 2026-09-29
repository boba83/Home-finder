import { useMutation, useQuery } from '@tanstack/react-query';
import { BellOff, BellRing, Info, Loader2, Send, Share, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxChip } from '@/components/ui/checkbox-chip';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { getCurrentSubscription, isIos, isPushSupported, isStandalone, subscribeToPush } from '@/lib/push';
import { GRUPA_NAZIV, TIP_NAZIV, type GrupaLokacije, type PushPreferences, type TipNekretnine } from '@/lib/types';

const DEFAULT_PREFS: PushPreferences = {
  grupe: ['ZAPADNA_FG', 'ISTOCNA_FG'],
  kategorije: ['PLAC', 'KUCA', 'VIKENDICA'],
  zaProveru: true,
};

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...new Set([...list, item])] : list.filter((x) => x !== item);
}

export function NotificationsPage() {
  const supported = isPushSupported();
  const config = useQuery({ queryKey: ['pushConfig'], queryFn: api.pushConfig });
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [checking, setChecking] = useState(true);
  const [prefs, setPrefs] = useState<PushPreferences>(DEFAULT_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<PushPreferences | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sub = await getCurrentSubscription();
        if (!sub) return;
        const status = await api.pushStatus(sub.endpoint);
        if (cancelled) return;
        if (status.subscribed && status.preferences) {
          setSubscription(sub);
          setPrefs(status.preferences);
          setSavedPrefs(status.preferences);
        } else if (config.data?.publicKey) {
          // Browser ima pretplatu koju server ne zna (npr. obrisana baza) — ponovo je registruj
          await api.pushSubscribe(sub.toJSON(), DEFAULT_PREFS);
          if (!cancelled) {
            setSubscription(sub);
            setSavedPrefs(DEFAULT_PREFS);
          }
        }
      } catch {
        /* status nije dostupan — prikazujemo stanje "isključeno" */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.data?.publicKey]);

  const enable = useMutation({
    mutationFn: async () => {
      if (!config.data?.publicKey) throw new Error('Server nema podešene VAPID ključeve');
      const sub = await subscribeToPush(config.data.publicKey);
      await api.pushSubscribe(sub.toJSON(), prefs);
      return sub;
    },
    onSuccess: (sub) => {
      setSubscription(sub);
      setSavedPrefs(prefs);
      setPermission(Notification.permission);
      toast.success('Notifikacije su uključene na ovom uređaju');
    },
    onError: (e) => {
      setPermission(supported ? Notification.permission : 'unsupported');
      toast.error(e.message);
    },
  });

  const disable = useMutation({
    mutationFn: async () => {
      if (!subscription) return;
      await api.pushUnsubscribe(subscription.endpoint).catch(() => undefined);
      await subscription.unsubscribe();
    },
    onSuccess: () => {
      setSubscription(null);
      setSavedPrefs(null);
      toast.success('Notifikacije su isključene');
    },
    onError: (e) => toast.error(e.message),
  });

  const savePrefs = useMutation({
    mutationFn: () => api.pushPreferences(subscription!.endpoint, prefs),
    onSuccess: () => {
      setSavedPrefs(prefs);
      toast.success('Izbor sačuvan');
    },
    onError: (e) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => api.pushTest(subscription?.endpoint),
    onSuccess: (r) => (r.poslato ? toast.success('Test notifikacija je poslata') : toast.error('Slanje nije uspelo — pokušaj ponovo da uključiš notifikacije')),
    onError: (e) => toast.error(e.message),
  });

  const dirty = !!subscription && JSON.stringify(prefs) !== JSON.stringify(savedPrefs);
  const nothingSelected = prefs.grupe.length === 0 || prefs.kategorije.length === 0;
  const iosNeedsInstall = isIos() && !isStandalone();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifikacije</h1>
        <p className="text-muted-foreground mt-1 text-sm">Push obaveštenje stiže čim skener pronađe nov oglas koji odgovara tvojim filterima.</p>
      </div>

      {!supported && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex gap-3 pt-6 text-sm text-amber-900">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              Ovaj browser ne podržava Web Push{iosNeedsInstall ? ' dok aplikacija nije dodata na početni ekran' : ''}.
              {!window.isSecureContext && ' Push radi samo preko HTTPS-a ili na localhost adresi.'}
            </div>
          </CardContent>
        </Card>
      )}

      {iosNeedsInstall && (
        <Card>
          <CardContent className="flex gap-3 pt-6 text-sm">
            <Smartphone className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">iPhone / iPad</div>
              <p className="text-muted-foreground">
                Otvori sajt u Safariju, dodirni <Share className="inline size-3.5" /> <b>Podeli</b> → <b>Dodaj na početni ekran</b>, pa
                otvori Home Finder sa početnog ekrana i ovde uključi notifikacije (iOS 16.4+).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {config.data && !config.data.enabled && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-1 pt-6 text-sm text-amber-900">
            <div className="font-medium">Server nema VAPID ključeve</div>
            <p>
              Pokreni <code className="rounded bg-amber-100 px-1">npm run vapid</code> u folderu projekta i restartuj server.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Ovaj uređaj</CardTitle>
              <CardDescription>
                {checking
                  ? 'Proveravam…'
                  : subscription
                    ? 'Notifikacije su uključene.'
                    : permission === 'denied'
                      ? 'Obaveštenja su blokirana. Dozvoli ih u podešavanjima sajta u browseru (ikonica katanca pored adrese).'
                      : 'Notifikacije nisu uključene.'}
              </CardDescription>
            </div>
            {!checking && <Badge variant={subscription ? 'success' : 'secondary'}>{subscription ? 'Uključeno' : 'Isključeno'}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {checking || config.isLoading ? (
            <Skeleton className="h-11 w-56" />
          ) : subscription ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Loader2 className="animate-spin" /> : <Send />} Pošalji test
              </Button>
              <Button variant="ghost" onClick={() => disable.mutate()} disabled={disable.isPending}>
                <BellOff /> Isključi
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              onClick={() => enable.mutate()}
              disabled={!supported || !config.data?.enabled || permission === 'denied' || enable.isPending || nothingSelected}
            >
              {enable.isPending ? <Loader2 className="animate-spin" /> : <BellRing />} Uključi notifikacije
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Za koje oglase</CardTitle>
          <CardDescription>Obaveštenja stižu samo za izabrane grupe lokacija i vrste nekretnina.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Grupe lokacija</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(GRUPA_NAZIV) as GrupaLokacije[]).map((g) => (
                <CheckboxChip key={g} checked={prefs.grupe.includes(g)} onCheckedChange={(on) => setPrefs({ ...prefs, grupe: toggle(prefs.grupe, g, on) })}>
                  {GRUPA_NAZIV[g]}
                </CheckboxChip>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Kategorije</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TIP_NAZIV) as TipNekretnine[]).map((t) => (
                <CheckboxChip
                  key={t}
                  checked={prefs.kategorije.includes(t)}
                  onCheckedChange={(on) => setPrefs({ ...prefs, kategorije: toggle(prefs.kategorije, t, on) })}
                >
                  {t === 'PLAC' ? 'Placevi' : t === 'KUCA' ? 'Kuće' : 'Vikendice'}
                </CheckboxChip>
              ))}
            </div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="zaProveru" className="cursor-pointer">
                Obaveštavaj i za oglase „Za proveru”
              </Label>
              <p className="text-muted-foreground text-xs">Oglasi kojima nedostaje površina placa ili cena.</p>
            </div>
            <Switch id="zaProveru" checked={prefs.zaProveru} onCheckedChange={(v) => setPrefs({ ...prefs, zaProveru: v })} />
          </div>
          {nothingSelected && <p className="text-destructive text-xs">Izaberi bar jednu grupu i jednu kategoriju.</p>}
        </CardContent>
        {subscription && (
          <CardFooter className="justify-end">
            <Button onClick={() => savePrefs.mutate()} disabled={!dirty || nothingSelected || savePrefs.isPending}>
              {savePrefs.isPending && <Loader2 className="animate-spin" />} Sačuvaj izbor
            </Button>
          </CardFooter>
        )}
      </Card>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Kada skener nađe više od 4 odgovarajuća oglasa odjednom (npr. pri prvom pokretanju), stiže jedno zbirno obaveštenje umesto
        pojedinačnih. Za push na telefonu aplikacija mora biti dostupna preko HTTPS-a — pogledaj README.
      </p>
    </div>
  );
}
