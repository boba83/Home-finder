import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxChipProps extends Omit<React.ComponentProps<'button'>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Dugme-čip koje se ponaša kao checkbox (za filtere i izbor opcija) */
function CheckboxChip({ checked, onCheckedChange, className, children, ...props }: CheckboxChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        checked ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {checked && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

export { CheckboxChip };
