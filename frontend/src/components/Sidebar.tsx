import { NavLink } from 'react-router-dom';

const linkBase = 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition';

function LinkItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
      }
      end
    >
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <div className="mb-4">
        <div className="text-lg font-semibold tracking-tight">Sistema MLH</div>
        <div className="text-xs text-slate-500">Gestão e lucratividade</div>
      </div>

      <nav className="flex flex-col gap-1">
        <LinkItem to="/dashboard" label="Dashboard" />
        <LinkItem to="/pedidos" label="Pedidos" />
        <LinkItem to="/produtos" label="Produtos" />
        <LinkItem to="/anuncios" label="Anúncios" />
        <LinkItem to="/otimizacao" label="Otimização" />
        <div className="mt-2 border-t border-slate-200 pt-2" />
        <LinkItem to="/config" label="Config" />
      </nav>

      <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
        Dica: defina <span className="font-mono">mlh_admin_secret</span> em Config para habilitar edição.
      </div>
    </aside>
  );
}
