'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

export const DASH_SELECT_EMPTY = '__dash_empty__';

export type DashboardSelectOption = {
  value: string;
  label: string;
};

type DashboardSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: DashboardSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** When true, prepends an empty option mapped to "" */
  allowEmpty?: boolean;
  emptyLabel?: string;
};

const contentClass =
  'z-[100] border border-[var(--dash-glass-border)] bg-[#0c1222]/98 text-slate-200 shadow-xl shadow-black/40 backdrop-blur-xl';

const itemClass =
  'cursor-pointer rounded-lg py-2 pl-8 pr-3 text-slate-200 focus:bg-teal-500/15 focus:text-teal-100 data-[highlighted]:bg-teal-500/15 data-[highlighted]:text-teal-100 data-[state=checked]:bg-teal-500/20 data-[state=checked]:text-teal-200';

export function DashboardSelect({
  value,
  onChange,
  options,
  placeholder = 'Select',
  className,
  disabled,
  allowEmpty,
  emptyLabel = '—',
}: DashboardSelectProps) {
  const normalizedOptions = options.filter((o) => o.value !== '');
  const list: DashboardSelectOption[] = allowEmpty
    ? [{ value: DASH_SELECT_EMPTY, label: emptyLabel }, ...normalizedOptions]
    : normalizedOptions;

  const innerValue = allowEmpty && value === '' ? DASH_SELECT_EMPTY : value;

  return (
    <Select
      value={innerValue}
      onValueChange={(v) =>
        onChange(v === DASH_SELECT_EMPTY ? '' : v)
      }
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          dash.field,
          'h-auto min-h-[42px] py-2.5 shadow-none ring-offset-0 focus:ring-teal-500/20 data-[placeholder]:text-[var(--dash-text-muted)]',
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClass} position="popper">
        {list.map((o) => (
          <SelectItem key={o.value} value={o.value} className={itemClass}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
