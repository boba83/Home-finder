import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Home, Loader2, Plus, RotateCcw, Save, ShieldAlert, Trash2, Trees } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxChip } from '@/components/ui/checkbox-chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatAres, formatDateTime, formatNumber } from '@/lib/format';
import { IZVOR_NAZIV, TIP_NAZIV, type Izvor, type IzvorInfo, type Podesavanja, type Pretraga, type SkeniranjeLog, type StatistikaIzvora } from '@/lib/types';
import { cn } from '@/lib/utils';

type Form = Omit<Podesavanja, 'azurirano'>;

function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  hint,
  min = 0,
  step = 1,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  hint?: ReactNode;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className={cn(suffix && 'pr-12')}
        />
        {suffix && <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">{suffix}</span>}
      </div>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function SwitchRow({ id, label, description, checked, onChange }: { id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

function SearchesEditor({
  izvor,
  value,
  onChange,
}: {
  izvor: IzvorInfo;
  value: Pretraga[] | undefined;
  onChange: (v: Pretraga[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const custom = value !== undefined;
  const list = value ?? izvor.podrazumevanePretrage;

  const edit = (i: number, patch: Partial<Pretraga>) => onChange(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
        <span className="font-medium">{izvor.naziv}</span>
        <Badge variant={custom ? 'warning' : 'secondary'}>{custom ? 'Prilagođeno' : 'Podrazumevano'}</Badge>
        <span className="text-muted-foreground text-xs">{list.length} pretraga</span>
        <ChevronDown className={cn('text-muted-foreground ml-auto size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-4">
          {list.map((p, i) => (
            <div key={i} className="bg-secondary/50 grid gap-2 rounded-lg p-3 sm:grid-cols-[1fr_8rem_auto]">
              <Input value={p.naziv} onChange={(e) => edit(i, { naziv: e.target.value })} placeholder="Naziv" aria-label="Naziv pretrage" />
              <Select value={p.tip} onChange={(e) => edit(i, { tip: e.target.value as Pretraga['tip'] })} aria-label="Tip">
                {(['PLAC', 'KUCA', 'VIKENDICA'] as const).map((t) => (
                  <option key={t} value={t}>
                    {TIP_NAZIV[t]}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" size="icon" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Obriši pretragu">
                <Trash2 />
              </Button>
              <Input
                value={p.url}
                onChange={(e) => edit(i, { url: e.target.value })}
                placeholder="https://..."
                aria-label="URL pretrage"
                className="font-mono text-xs sm:col-span-3"
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onChange([...list, { naziv: `${izvor.naziv} - nova`, url: '', tip: 'PLAC' }])}>
              <Plus /> Dodaj pretragu
            </Button>
            {custom && (
              <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
                <RotateCcw /> Vrati podrazumevane
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            URL je stranica sa listom oglasa, sortirana od najnovijih. U URL-u možeš koristiti <code>{'{placMaxCena}'}</code> i{' '}
            <code>{'{kucaMaxCena}'}</code> — biće zamenjeni vrednostima iz filtera.
          </p>
        </div>
      )}
    </div>
  );
}

const LOG_STATUS: Record<SkeniranjeLog['status'], { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  USPESNO: { label: 'Uspešno', variant: 'success' },
  DELIMICNO: { label: 'Delimično', variant: 'warning' },
  GRESKA: { label: 'Greška', variant: 'destructive' },
  U_TOKU: { label: 'U toku', variant: 'secondary' },
};

function logErrors(log: SkeniranjeLog): string[] {
  const d = log.detalji;
  if (!d) return [];
  if ('greska' in d && typeof d.greska === 'string') return [d.greska];
  return Object.entries(d as Record<string, StatistikaIzvora | undefined>).flatMap(([izvor, s]) =>
    s?.greske ? s.greske.map((g) => `${IZVOR_NAZIV[izvor as Izvor] ?? izvor}: ${g}`) : [],
  );
}

function ScanStatusCard() {
  const status = useQuery({ queryKey: ['scrapeStatus'], queryFn: api.scrapeStatus, refetchInterval: 15_000 });
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: (duboko: boolean) => api.runScrape(duboko),
    onSuccess: () => {
      toast.info('Skeniranje je pokrenuto');
      qc.invalidateQueries({ queryKey: ['scrapeStatus'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const s = status.data;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Status skeniranja</CardTitle>
        <CardDescription>
          {s?.running
            ? `U toku${s.progress ? `: ${s.progress.pretraga}, strana ${s.progress.strana}` : ''}`
            : s?.sledeceSkeniranje
              ? `Sledeće automatsko skeniranje: ${formatDateTime(s.sledeceSkeniranje)}`
              : 'Automatsko skeniranje je isključeno'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run.mutate(false)} disabled={s?.running || run.isPending}>
            {s?.running && <Loader2 className="animate-spin" />} Skeniraj sada
          </Button>
          <Button variant="outline" onClick={() => run.mutate(true)} disabled={s?.running || run.isPending} title="Pregleda do 25 strana po pretrazi">
            Duboko skeniranje
          </Button>
        </div>

        {!!s?.blokirani.length && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">Anti-bot zaštita je privremeno blokirala pristup</div>
              {s.blokirani.map((b) => (
                <div key={b.host}>
                  {b.host} — pauza do {formatDateTime(b.until)}
                </div>
              ))}
              <div className="mt-1 text-xs opacity-80">Aplikacija će sama nastaviti posle pauze. Ne pokušavaj ručno skeniranje u međuvremenu.</div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Početak</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 text-right font-medium">Pregledano</th>
                <th className="py-2 pr-3 text-right font-medium">Novih</th>
                <th className="py-2 pr-3 text-right font-medium">Odgovara</th>
                <th className="py-2 font-medium">Napomene</th>
              </tr>
            </thead>
            <tbody>
              {status.isLoading && (
                <tr>
                  <td colSpan={6} className="py-3">
                    <Skeleton className="h-6" />
                  </td>
                </tr>
              )}
              {s?.logs.map((l) => {
                const errs = logErrors(l);
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(l.pocetak)}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={LOG_STATUS[l.status].variant}>{LOG_STATUS[l.status].label}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.pregledano}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.novih}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{l.odobrenih}</td>
                    <td className="text-muted-foreground max-w-xs truncate py-2 text-xs" title={errs.join('\n')}>
                      {errs.length ? errs.join(' • ') : '—'}
                    </td>
                  </tr>
                );
              })}
              {s && !s.logs.length && (
                <tr>
                  <td colSpan={6} className="text-muted-foreground py-4 text-center">
                    Još nije bilo skeniranja
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources, staleTime: Infinity });
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (settings.data) {
      const { azurirano: _ignored, ...rest } = settings.data;
      setForm(rest);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (data: Form) => api.saveSettings(data),
    onSuccess: ({ settings: saved, promenjenoOglasa }) => {
      qc.setQueryData(['settings'], saved);
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['scrapeStatus'] });
      toast.success('Podešavanja sačuvana', {
        description: promenjenoOglasa ? `Ponovo procenjeno: ${promenjenoOglasa} oglasa promenilo status` : undefined,
      });
    },
    onError: (e) => toast.error(e.message),
  });

  if (settings.isError) {
    return <div className="text-destructive rounded-xl border p-6 text-sm">Greška: {settings.error.message}</div>;
  }
  if (!form || !sources.data) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });
  const original = settings.data ? (({ azurirano: _a, ...r }) => r)(settings.data) : null;
  const dirty = JSON.stringify(original) !== JSON.stringify(form);
  const invalid =
    [form.placMinPovrsina, form.placMaxPovrsina, form.placMaxCena, form.kucaMaxCena, form.kucaMinPovrsinaPlaca, form.kursEurRsd].some(
      (v) => !Number.isFinite(v) || v <= 0,
    ) ||
    form.placMinPovrsina > form.placMaxPovrsina ||
    !(form.intervalMinuta >= 5 && form.intervalMinuta <= 59) ||
    !(form.brojStranaPoPretrazi >= 1 && form.brojStranaPoPretrazi <= 20);

  const submit = () => {
    const pretrage = Object.fromEntries(
      Object.entries(form.pretrage).map(([k, list]) => [k, (list ?? []).filter((p) => p.url.trim().startsWith('http'))]),
    );
    save.mutate({ ...form, pretrage });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Podešavanja</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Promena filtera odmah ponovo procenjuje sve sačuvane oglase — ranije odbijeni oglasi se pojavljuju ako sada odgovaraju.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trees className="text-primary size-5" /> Placevi
            </CardTitle>
            <CardDescription>
              Površina {formatAres(form.placMinPovrsina)} – {formatAres(form.placMaxPovrsina)}, cena do {formatNumber(form.placMaxCena || 0)} €
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <NumberField id="placMin" label="Minimalna površina" suffix="m²" value={form.placMinPovrsina} onChange={(v) => set('placMinPovrsina', v)} />
            <NumberField id="placMax" label="Maksimalna površina" suffix="m²" value={form.placMaxPovrsina} onChange={(v) => set('placMaxPovrsina', v)} />
            <NumberField
              id="placCena"
              label="Maksimalna cena"
              suffix="€"
              step={500}
              value={form.placMaxCena}
              onChange={(v) => set('placMaxCena', v)}
            />
            {form.placMinPovrsina > form.placMaxPovrsina && (
              <p className="text-destructive self-end text-xs sm:col-span-2">Minimalna površina je veća od maksimalne.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="text-primary size-5" /> Kuće i vikendice
            </CardTitle>
            <CardDescription>
              Cena do {formatNumber(form.kucaMaxCena || 0)} €, plac najmanje {formatAres(form.kucaMinPovrsinaPlaca)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="kucaCena"
              label="Maksimalna cena"
              suffix="€"
              step={1000}
              value={form.kucaMaxCena}
              onChange={(v) => set('kucaMaxCena', v)}
            />
            <NumberField
              id="kucaPlac"
              label="Minimalna površina placa"
              suffix="m²"
              value={form.kucaMinPovrsinaPlaca}
              onChange={(v) => set('kucaMinPovrsinaPlaca', v)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ponašanje filtera</CardTitle>
            <CardDescription>Šta raditi sa oglasima kojima nedostaju podaci</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SwitchRow
              id="kuceBezPlaca"
              label="Kuće bez navedenog placa → „Za proveru”"
              description="Ako je isključeno, takve kuće se odbacuju."
              checked={form.kuceBezPlacaZaProveru}
              onChange={(v) => set('kuceBezPlacaZaProveru', v)}
            />
            <SwitchRow
              id="bezCene"
              label="Oglasi bez cene → „Za proveru”"
              description="Cena na upit / dogovor. Ako je isključeno, takvi oglasi se odbacuju."
              checked={form.bezCeneZaProveru}
              onChange={(v) => set('bezCeneZaProveru', v)}
            />
            <NumberField
              id="kurs"
              label="Kurs EUR/RSD"
              step={0.1}
              value={form.kursEurRsd}
              onChange={(v) => set('kursEurRsd', v)}
              hint="Koristi se za preračun cena koje su izražene u dinarima."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Skeniranje</CardTitle>
            <CardDescription>Automatska provera sajtova</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SwitchRow
              id="aktivno"
              label="Automatsko skeniranje"
              checked={form.skeniranjeAktivno}
              onChange={(v) => set('skeniranjeAktivno', v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="interval"
                label="Interval"
                suffix="min"
                min={5}
                value={form.intervalMinuta}
                onChange={(v) => set('intervalMinuta', v)}
                hint="5–59 min (preporuka 10–15)"
              />
              <NumberField
                id="strane"
                label="Strana po pretrazi"
                min={1}
                value={form.brojStranaPoPretrazi}
                onChange={(v) => set('brojStranaPoPretrazi', v)}
                hint="1–20; staje ranije kad naiđe na poznate oglase"
              />
            </div>
            <div className="space-y-2">
              <Label>Aktivni izvori</Label>
              <div className="flex flex-wrap gap-2">
                {sources.data.map((s) => (
                  <CheckboxChip
                    key={s.id}
                    checked={form.aktivniIzvori.includes(s.id)}
                    onCheckedChange={(on) =>
                      set('aktivniIzvori', on ? [...form.aktivniIzvori, s.id] : form.aktivniIzvori.filter((x) => x !== s.id))
                    }
                  >
                    {s.naziv}
                  </CheckboxChip>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Napredno: pretrage po sajtovima</CardTitle>
            <CardDescription>
              Koje se stranice sa listama oglasa skeniraju. Podrazumevane pretrage pokrivaju opštine Sremski Karlovci, Irig, Beočin, Inđija,
              Novi Sad i Sremska Mitrovica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sources.data.map((s) => (
              <SearchesEditor
                key={s.id}
                izvor={s}
                value={form.pretrage[s.id]}
                onChange={(list) => {
                  const next = { ...form.pretrage };
                  if (list === undefined) delete next[s.id];
                  else next[s.id] = list;
                  set('pretrage', next);
                }}
              />
            ))}
          </CardContent>
        </Card>

        <ScanStatusCard />
      </div>

      <div
        className={cn(
          'bg-card/95 sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-xl border p-3 shadow-lg backdrop-blur transition-all md:bottom-4',
          dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        )}
      >
        <span className="text-sm font-medium">{invalid ? 'Proveri unete vrednosti' : 'Imaš nesačuvane izmene'}</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => original && setForm(original)}>
            Poništi
          </Button>
          <Button onClick={submit} disabled={invalid || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Sačuvaj
          </Button>
        </div>
      </div>
    </div>
  );
}
