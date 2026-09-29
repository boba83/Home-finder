import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { CheckCheck, Loader2, RefreshCw, Search, SearchX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ListingCard } from '@/components/ListingCard';
import { Button } from '@/components/ui/button';
import { CheckboxChip } from '@/components/ui/checkbox-chip';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type ListingsQuery } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { IZVORI, IZVOR_KRATKO, type GrupaLokacije, type Izvor, type ListingsResponse, type Oglas } from '@/lib/types';
import { usePersistentState } from '@/lib/usePersistentState';

type Kategorija = 'PLAC' | 'KUCE';
type Oznaka = 'aktivni' | 'novo' | 'omiljeno' | 'arhivirano';
type Status = 'SVI_VIDLJIVI' | 'ODOBREN' | 'ZA_PROVERU' | 'ODBIJEN';

const PAGE_SIZE = 24;

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function FeedPage() {
  const qc = useQueryClient();
  const [grupa, setGrupa] = usePersistentState<GrupaLokacije>('feed.grupa', 'ZAPADNA_FG');
  const [kategorija, setKategorija] = usePersistentState<Kategorija>('feed.kategorija', 'PLAC');
  const [oznaka, setOznaka] = usePersistentState<Oznaka>('feed.oznaka', 'aktivni');
  const [status, setStatus] = usePersistentState<Status>('feed.status', 'SVI_VIDLJIVI');
  const [sort, setSort] = usePersistentState('feed.sort', 'datum_desc');
  const [izvori, setIzvori] = usePersistentState<Izvor[]>('feed.izvori', []);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());

  const query: ListingsQuery = { grupa, kategorija, oznaka, status, sort, izvor: izvori, q, pageSize: PAGE_SIZE };
  const listingsKey = ['listings', query] as const;

  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 60_000 });
  const scrape = useQuery({
    queryKey: ['scrapeStatus'],
    queryFn: api.scrapeStatus,
    refetchInterval: (qr) => (qr.state.data?.running ? 4_000 : 30_000),
  });

  const listings = useInfiniteQuery({
    queryKey: listingsKey,
    queryFn: ({ pageParam }) => api.listings({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const wasRunning = useRef(false);
  useEffect(() => {
    const running = scrape.data?.running ?? false;
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      const log = scrape.data?.logs[0];
      if (log) toast.success(`Skeniranje završeno: ${log.novih} novih, ${log.odobrenih} odgovara kriterijumima`);
    }
    wasRunning.current = running;
  }, [scrape.data, qc, wasRunning]);

  const patchCache = (id: number, patch: Partial<Oglas>) => {
    qc.setQueriesData<InfiniteData<ListingsResponse>>({ queryKey: ['listings'] }, (data) =>
      data
        ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((o) => (o.id === id ? { ...o, ...patch } : o)) })) }
        : data,
    );
  };

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Pick<Oglas, 'omiljeno' | 'arhivirano' | 'novo'>> }) => api.updateListing(id, data),
    onMutate: ({ id, data }) => patchCache(id, data),
    onError: (err) => {
      toast.error(err.message);
      qc.invalidateQueries({ queryKey: ['listings'] });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['stats'] }),
  });

  const runScrape = useMutation({
    mutationFn: () => api.runScrape(),
    onSuccess: () => {
      toast.info('Skeniranje je pokrenuto');
      qc.invalidateQueries({ queryKey: ['scrapeStatus'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const markAll = useMutation({
    mutationFn: api.markAllSeen,
    onSuccess: (r) => {
      toast.success(r.azurirano ? `${r.azurirano} oglasa označeno kao pregledano` : 'Nema novih oglasa');
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const count = (g: GrupaLokacije, k?: Kategorija) =>
    (stats.data?.matrica ?? [])
      .filter((r) => r.grupa === g && (!k || (k === 'PLAC' ? r.tip === 'PLAC' : r.tip !== 'PLAC')))
      .reduce((s, r) => s + r.broj, 0);

  const items = listings.data?.pages.flatMap((p) => p.items) ?? [];
  const total = listings.data?.pages[0]?.total ?? 0;
  const lastLog = scrape.data?.logs.find((l) => l.status !== 'U_TOKU');

  const openListing = (o: Oglas) => {
    window.open(o.link, '_blank', 'noopener,noreferrer');
    if (o.novo) update.mutate({ id: o.id, data: { novo: false } });
  };

  const toggleIzvor = (id: Izvor, on: boolean) => setIzvori(on ? [...izvori, id] : izvori.filter((x) => x !== id));

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Oglasi</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {scrape.data?.running ? (
              <span className="text-primary inline-flex items-center gap-1.5 font-medium">
                <Loader2 className="size-3.5 animate-spin" />
                Skeniranje u toku{scrape.data.progress ? ` — ${scrape.data.progress.pretraga}, strana ${scrape.data.progress.strana}` : ''}
              </span>
            ) : lastLog ? (
              <>
                Poslednje skeniranje {timeAgo(lastLog.kraj ?? lastLog.pocetak)}
                {scrape.data?.sledeceSkeniranje && <> • sledeće u {formatDateTime(scrape.data.sledeceSkeniranje).split(' ').pop()}</>}
              </>
            ) : (
              'Još nije bilo skeniranja'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => markAll.mutate()} disabled={!stats.data?.novih || markAll.isPending}>
            <CheckCheck /> Označi sve kao pregledano
            {!!stats.data?.novih && <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">{stats.data.novih}</span>}
          </Button>
          <Button onClick={() => runScrape.mutate()} disabled={scrape.data?.running || runScrape.isPending}>
            <RefreshCw className={scrape.data?.running ? 'animate-spin' : undefined} />
            Skeniraj sada
          </Button>
        </div>
      </section>

      <section className="bg-card space-y-4 rounded-xl border p-3 shadow-sm sm:p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Segmented
            className="w-full"
            value={grupa}
            onChange={setGrupa}
            options={[
              { value: 'ZAPADNA_FG', label: 'Zapadna FG', count: count('ZAPADNA_FG') },
              { value: 'ISTOCNA_FG', label: 'Istočna FG', count: count('ISTOCNA_FG') },
            ]}
          />
          <Segmented
            className="w-full"
            value={kategorija}
            onChange={setKategorija}
            options={[
              { value: 'PLAC', label: 'Placevi', count: count(grupa, 'PLAC') },
              { value: 'KUCE', label: 'Vikendice / Kuće', count: count(grupa, 'KUCE') },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Segmented
            className="w-full overflow-x-auto sm:w-fit"
            value={oznaka}
            onChange={setOznaka}
            options={[
              { value: 'aktivni', label: 'Svi' },
              { value: 'novo', label: 'Novo', count: stats.data?.novih },
              { value: 'omiljeno', label: 'Omiljeno', count: stats.data?.omiljenih },
              { value: 'arhivirano', label: 'Arhivirano', count: stats.data?.arhiviranih },
            ]}
          />
          <div className="flex flex-1 flex-wrap gap-2 sm:flex-nowrap">
            <div className="relative min-w-48 flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pretraga (mesto, naslov, opis)…" className="pl-9" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="w-full sm:w-44" aria-label="Status">
              <option value="SVI_VIDLJIVI">Odobreni + za proveru</option>
              <option value="ODOBREN">Samo odobreni</option>
              <option value="ZA_PROVERU">Samo za proveru</option>
              <option value="ODBIJEN">Odbijeni</option>
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-full sm:w-48" aria-label="Sortiranje">
              <option value="datum_desc">Najnovije pronađeni</option>
              <option value="datum_asc">Najstarije pronađeni</option>
              <option value="cena_asc">Cena: rastuće</option>
              <option value="cena_desc">Cena: opadajuće</option>
              <option value="plac_desc">Plac: najveći</option>
              <option value="plac_asc">Plac: najmanji</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-1 text-xs font-medium tracking-wide uppercase">Izvori</span>
          {IZVORI.map((id) => (
            <CheckboxChip key={id} checked={izvori.includes(id)} onCheckedChange={(on) => toggleIzvor(id, on)}>
              {IZVOR_KRATKO[id]}
              {stats.data?.poIzvoru[id] ? <span className="opacity-60">{stats.data.poIzvoru[id]}</span> : null}
            </CheckboxChip>
          ))}
          {izvori.length > 0 && (
            <Button variant="link" size="sm" onClick={() => setIzvori([])}>
              Svi izvori
            </Button>
          )}
        </div>
      </section>

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          {listings.isLoading ? 'Učitavanje…' : `${total} ${total === 1 ? 'oglas' : 'oglasa'}`}
          {listings.isFetching && !listings.isLoading && <Loader2 className="ml-2 inline size-3.5 animate-spin" />}
        </span>
      </div>

      {listings.isError && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-6 text-center text-sm">
          Greška pri učitavanju: {listings.error.message}. Da li je server pokrenut?
        </div>
      )}

      {listings.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-10" />
                <Skeleton className="h-14" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 && !listings.isError ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <SearchX className="text-muted-foreground size-10" strokeWidth={1.5} />
          <div className="font-medium">Nema oglasa za izabrane filtere</div>
          <p className="text-muted-foreground max-w-md text-sm">
            Novi oglasi se automatski pojavljuju posle svakog skeniranja. Proveri drugu grupu ili kategoriju, ili pokreni skeniranje ručno.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((o) => (
            <ListingCard
              key={o.id}
              oglas={o}
              onOpen={openListing}
              onToggleFavorite={(x) => update.mutate({ id: x.id, data: { omiljeno: !x.omiljeno } })}
              onToggleArchive={(x) => {
                update.mutate({ id: x.id, data: { arhivirano: !x.arhivirano, ...(x.arhivirano ? {} : { novo: false }) } });
                toast(x.arhivirano ? 'Oglas vraćen iz arhive' : 'Oglas arhiviran', {
                  action: x.arhivirano
                    ? undefined
                    : { label: 'Poništi', onClick: () => update.mutate({ id: x.id, data: { arhivirano: false } }) },
                });
              }}
            />
          ))}
        </div>
      )}

      {listings.hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="lg" onClick={() => listings.fetchNextPage()} disabled={listings.isFetchingNextPage}>
            {listings.isFetchingNextPage && <Loader2 className="animate-spin" />}
            Učitaj još ({total - items.length})
          </Button>
        </div>
      )}
    </div>
  );
}
