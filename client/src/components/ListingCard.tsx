import { Archive, ArchiveRestore, ExternalLink, House, MapPin, Ruler, Star, Trees, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatAres, formatArea, formatPrice, timeAgo } from '@/lib/format';
import { GRUPA_NAZIV, IZVOR_KRATKO, TIP_NAZIV, type Oglas } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ListingCardProps {
  oglas: Oglas;
  onToggleFavorite: (o: Oglas) => void;
  onToggleArchive: (o: Oglas) => void;
  onOpen: (o: Oglas) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  KP: 'bg-amber-500',
  HALO: 'bg-orange-600',
  NEKRETNINE: 'bg-sky-600',
  NADJIDOM: 'bg-violet-600',
  OGLASI: 'bg-rose-600',
};

export function ListingCard({ oglas, onToggleFavorite, onToggleArchive, onOpen }: ListingCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const TipIcon = oglas.tipNekretnine === 'PLAC' ? Trees : House;

  return (
    <article
      className={cn(
        'group bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md',
        oglas.arhivirano && 'opacity-70',
      )}
    >
      <div className="bg-muted relative aspect-[4/3] overflow-hidden">
        {oglas.slika && !imgFailed ? (
          <img
            src={oglas.slika}
            alt={oglas.naslov}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="text-muted-foreground/40 flex size-full items-center justify-center">
            <TipIcon className="size-16" strokeWidth={1.2} />
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {oglas.novo && !oglas.arhivirano && <Badge className="shadow-sm">Novo</Badge>}
          {oglas.status === 'ZA_PROVERU' && (
            <Badge variant="warning" className="shadow-sm" title={oglas.razlogStatusa ?? undefined}>
              <TriangleAlert /> Za proveru
            </Badge>
          )}
          {oglas.status === 'ODBIJEN' && (
            <Badge variant="destructive" className="shadow-sm" title={oglas.razlogStatusa ?? undefined}>
              Odbijen
            </Badge>
          )}
          {oglas.arhivirano && <Badge variant="secondary">Arhivirano</Badge>}
        </div>

        <button
          type="button"
          onClick={() => onToggleFavorite(oglas)}
          aria-label={oglas.omiljeno ? 'Ukloni iz omiljenih' : 'Dodaj u omiljene'}
          className="absolute top-2 right-2 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-105"
        >
          <Star className={cn('size-4.5', oglas.omiljeno ? 'fill-amber-400 text-amber-500' : 'text-neutral-600')} />
        </button>

        <span
          className={cn(
            'absolute bottom-2.5 left-2.5 rounded-md px-2 py-0.5 text-xs font-semibold text-white shadow-sm',
            SOURCE_COLORS[oglas.izvor] ?? 'bg-neutral-700',
          )}
        >
          {IZVOR_KRATKO[oglas.izvor]}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xl font-bold tracking-tight">{formatPrice(oglas.cena)}</div>
          <Badge variant="outline" className="mt-1">
            <TipIcon /> {TIP_NAZIV[oglas.tipNekretnine]}
          </Badge>
        </div>

        <h3 className="line-clamp-2 min-h-10 text-sm leading-5 font-medium" title={oglas.naslov}>
          {oglas.naslov}
        </h3>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-secondary rounded-lg px-3 py-2">
            <dt className="text-muted-foreground flex items-center gap-1 text-xs">
              <Trees className="size-3.5" /> Plac
            </dt>
            <dd className={cn('font-semibold', !oglas.povrsinaPlaca && 'text-muted-foreground font-normal')}>
              {oglas.povrsinaPlaca ? (
                <>
                  {formatAres(oglas.povrsinaPlaca)}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">({formatArea(oglas.povrsinaPlaca)})</span>
                </>
              ) : (
                'nije navedeno'
              )}
            </dd>
          </div>
          <div className="bg-secondary rounded-lg px-3 py-2">
            <dt className="text-muted-foreground flex items-center gap-1 text-xs">
              <Ruler className="size-3.5" /> Objekat
            </dt>
            <dd className={cn('font-semibold', !oglas.povrsinaObjekta && 'text-muted-foreground font-normal')}>
              {oglas.tipNekretnine === 'PLAC' ? '—' : formatArea(oglas.povrsinaObjekta)}
            </dd>
          </div>
        </dl>

        <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <MapPin className="text-primary size-4 shrink-0" />
          <span className="text-foreground truncate font-medium">{oglas.mesto}</span>
          <span className="shrink-0">• {GRUPA_NAZIV[oglas.grupaLokacije]}</span>
        </div>

        {oglas.status !== 'ODOBREN' && oglas.razlogStatusa && (
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{oglas.razlogStatusa}</p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button className="flex-1" onClick={() => onOpen(oglas)}>
            <ExternalLink /> Otvori oglas
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onToggleArchive(oglas)}
            aria-label={oglas.arhivirano ? 'Vrati iz arhive' : 'Arhiviraj'}
            title={oglas.arhivirano ? 'Vrati iz arhive' : 'Arhiviraj'}
          >
            {oglas.arhivirano ? <ArchiveRestore /> : <Archive />}
          </Button>
        </div>
        <div className="text-muted-foreground -mt-1 text-xs">Pronađeno {timeAgo(oglas.pronadjeno)}</div>
      </div>
    </article>
  );
}
