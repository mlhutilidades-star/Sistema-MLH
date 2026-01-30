import { useLocation } from 'react-router-dom';

const titles: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Visão rápida do negócio' },
  '/pedidos': { title: 'Pedidos', subtitle: 'Lucro e margem por pedido' },
  '/produtos': { title: 'Produtos', subtitle: 'Custos, margem e upload Tiny' },
  '/anuncios': { title: 'Anúncios', subtitle: 'Catálogo Shopee (listings)' },
  '/config': { title: 'Config', subtitle: 'API e credenciais admin' },
};

export function Topbar() {
  const { pathname } = useLocation();
  const meta = titles[pathname] || { title: 'Sistema MLH' };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <div>
          <div className="text-base font-semibold text-slate-900">{meta.title}</div>
          {meta.subtitle ? <div className="text-sm text-slate-600">{meta.subtitle}</div> : null}
        </div>

        <a
          href="https://api-backend-production-af22.up.railway.app/health"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
        >
          Health API
        </a>
      </div>
    </header>
  );
}
