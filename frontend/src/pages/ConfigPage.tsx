import { useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { api, getApiBaseUrl, getAdminSecret } from '../services/api';

type ShopeeOauthStatus = {
  source: 'db' | 'env' | 'none';
  shopId?: number;
  partnerId?: number;
  accessTokenMasked: string;
  refreshTokenMasked: string;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  accessTokenDaysLeft: number | null;
  refreshTokenDaysLeft: number | null;
  refreshTokenWillExpireSoon: boolean | null;
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
  needsReauth: boolean;
};

type AuthorizeUrlResponse = {
  redirectUrl: string;
  url: string;
};

type ExchangeResponse = {
  shopId: number;
  partnerId: number;
  expireIn: number;
  accessTokenMasked: string;
  refreshTokenMasked: string;
  stored?: string;
};

export function ConfigPage() {
  const apiBase = useLocalStorage('mlh_api_base_url', getApiBaseUrl());
  const adminSecret = useLocalStorage('mlh_admin_secret', getAdminSecret() || '');

  const [shopeeStatus, setShopeeStatus] = useState<ShopeeOauthStatus | null>(null);
  const [shopeeAuth, setShopeeAuth] = useState<AuthorizeUrlResponse | null>(null);
  const [shopeeExchange, setShopeeExchange] = useState<ExchangeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAdmin = useMemo(() => (adminSecret.value || '').trim().length > 0, [adminSecret.value]);

  async function fetchShopeeStatus() {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.get<{ success: true } & ShopeeOauthStatus>('/api/shopee/oauth/status');
      setShopeeStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShopeeStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAuthorizeUrl() {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.get<{ success: true } & AuthorizeUrlResponse>('/api/shopee/oauth/authorize-url');
      setShopeeAuth({ redirectUrl: data.redirectUrl, url: data.url });
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function exchangeCode() {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ success: true } & ExchangeResponse>('/api/shopee/oauth/exchange', {});
      setShopeeExchange(data);
      await fetchShopeeStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshNow() {
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/shopee/oauth/refresh', {});
      await fetchShopeeStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasAdmin) fetchShopeeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdmin]);

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

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Shopee OAuth</div>
            <div className="mt-1 text-sm text-slate-600">
              Status de tokens + ações de autorização/refresh (requer Admin Secret).
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={fetchShopeeStatus}
              disabled={!hasAdmin || loading}
            >
              Atualizar status
            </button>
          </div>
        </div>

        {!hasAdmin ? (
          <div className="mt-4 text-sm text-amber-700">
            Informe o <span className="font-mono">OAUTH_ADMIN_SECRET</span> acima para liberar as ações.
          </div>
        ) : null}

        {error ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <div className="mt-4 grid gap-2 text-sm">
          <div>
            Fonte: <span className="font-mono">{shopeeStatus?.source ?? '-'}</span>
          </div>
          <div>
            Shop ID: <span className="font-mono">{shopeeStatus?.shopId ?? '-'}</span>
          </div>
          <div>
            Access token: <span className="font-mono">{shopeeStatus?.accessTokenMasked ?? '-'}</span>
          </div>
          <div>
            Refresh token: <span className="font-mono">{shopeeStatus?.refreshTokenMasked ?? '-'}</span>
          </div>
          <div>
            Access expira em:{' '}
            <span className="font-mono">
              {typeof shopeeStatus?.accessTokenDaysLeft === 'number' ? `${shopeeStatus.accessTokenDaysLeft}d` : '-'}
            </span>
          </div>
          <div>
            Refresh expira em:{' '}
            <span className="font-mono">
              {typeof shopeeStatus?.refreshTokenDaysLeft === 'number' ? `${shopeeStatus.refreshTokenDaysLeft}d` : '-'}
            </span>
          </div>
          {shopeeStatus?.needsReauth ? (
            <div className="mt-1 text-sm font-semibold text-rose-700">
              Precisa reautorizar (refresh inválido/ausente).
            </div>
          ) : null}
          {shopeeStatus?.refreshTokenWillExpireSoon ? (
            <div className="mt-1 text-sm font-semibold text-amber-700">Atenção: refresh token perto de expirar (&lt; 7 dias).</div>
          ) : null}
          {shopeeStatus?.lastRefreshError ? (
            <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              Último erro: {shopeeStatus.lastRefreshError}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            onClick={fetchAuthorizeUrl}
            disabled={!hasAdmin || loading}
          >
            Abrir autorização
          </button>

          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            onClick={exchangeCode}
            disabled={!hasAdmin || loading}
          >
            Trocar code por tokens
          </button>

          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            onClick={refreshNow}
            disabled={!hasAdmin || loading}
          >
            Refresh agora
          </button>
        </div>

        {shopeeAuth ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            <div>
              Redirect URL: <span className="font-mono">{shopeeAuth.redirectUrl}</span>
            </div>
            <div className="mt-1">
              URL: <span className="font-mono break-all">{shopeeAuth.url}</span>
            </div>
          </div>
        ) : null}

        {shopeeExchange ? (
          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
            Tokens salvos ({shopeeExchange.stored || 'ok'}): access={shopeeExchange.accessTokenMasked} refresh={shopeeExchange.refreshTokenMasked}
          </div>
        ) : null}
      </div>

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
