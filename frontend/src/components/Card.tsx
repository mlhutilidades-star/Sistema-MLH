import type { ReactNode } from 'react';

export function Card({ title, subtitle, children, right }: { title: string; subtitle?: string; children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-600">{title}</div>
          {subtitle ? <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
