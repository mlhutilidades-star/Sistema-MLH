import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="text-lg font-semibold">Página não encontrada</div>
      <div className="mt-2 text-sm text-slate-600">A rota acessada não existe.</div>
      <Link
        to="/dashboard"
        className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Ir para Dashboard
      </Link>
    </div>
  );
}
