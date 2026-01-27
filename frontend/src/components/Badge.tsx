import type { ReactNode } from 'react';

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'yellow' | 'red' | 'blue'; children: ReactNode }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    green: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    yellow: 'bg-amber-100 text-amber-800 ring-amber-200',
    red: 'bg-rose-100 text-rose-700 ring-rose-200',
    blue: 'bg-sky-100 text-sky-700 ring-sky-200',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}
