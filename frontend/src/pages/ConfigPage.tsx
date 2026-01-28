import { useLocalStorage } from '../hooks/useLocalStorage';
import { getApiBaseUrl, getAdminSecret } from '../services/api';
import { ShopeeAuth } from '../components/ShopeeAuth';

export function ConfigPage() {
  const apiBase = useLocalStorage('mlh_api_base_url', getApiBaseUrl());
  const adminSecret = useLocalStorage('mlh_admin_secret', getAdminSecret() || '');

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-base font-semibold">Conexão com API</div>
        <div className="mt-1 text-sm text-slate-600">Base URL do backend (Railway).</div>

        <div className="mt-4 grid gap-2">
          <label className="text-sm font-medium text-slate-700">VITE_API_BASE_URL (override)</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/20"
            placeholder="https://api-backend-production-af22.up.railway.app"
            value={apiBase.value}
            onChange={(e) => apiBase.setValue(e.target.value)}
          />
          <div className="text-xs text-slate-500">Dica: deixe vazio para usar o padrão embutido.</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-base font-semibold">Admin Secret</div>
        <div className="mt-1 text-sm text-slate-600">
          Necessário para ações administrativas (upload planilha e algumas edições).
        </div>

        <div className="mt-4 grid gap-2">
          <label className="text-sm font-medium text-slate-700">x-admin-secret</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/20"
            placeholder="Cole aqui seu OAUTH_ADMIN_SECRET"
            value={adminSecret.value}
            onChange={(e) => adminSecret.setValue(e.target.value)}
          />
          <div className="text-xs text-slate-500">
            Fica salvo no navegador (localStorage). Não compartilhe prints com o valor.
          </div>
        </div>
      </div>

      <ShopeeAuth adminSecretValue={adminSecret.value} />

      <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
        <div className="text-sm font-semibold">Status atual</div>
        <div className="mt-2 grid gap-1 text-sm text-slate-200">
          <div>
            API: <span className="font-mono">{getApiBaseUrl()}</span>
          </div>
          <div>
            Admin Secret: <span className="font-mono">{getAdminSecret() ? 'definido' : 'não definido'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
