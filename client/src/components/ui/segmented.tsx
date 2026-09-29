import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
}

/** Tabovi u stilu shadcn/ui Tabs liste */
function Segmented<T extends string>({ value, onChange, options, className }: SegmentedProps<T>) {
  return (
    <div role="tablist" className={cn('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center rounded-lg p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', value === o.value ? 'bg-primary/10 text-primary' : 'bg-background/60')}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export { Segmented };
