import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';

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
  scheduler?: {
    enabled: boolean;
    cron: string | null;
    ifExpiringInSec: number | null;
    forceRefreshTokenInDays: number | null;
  };
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

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString();
}

function statusLabel(status: ShopeeOauthStatus | null): { label: string; tone: 'ok' | 'warn' | 'err' } {
  if (!status) return { label: 'Desconhecido', tone: 'warn' };
  if (status.needsReauth) return { label: 'Precisa reautorizar', tone: 'err' };
  if (status.lastRefreshError) return { label: 'Erro', tone: 'err' };
  if (status.source === 'none') return { label: 'Inativo', tone: 'warn' };
  return { label: 'Ativo', tone: 'ok' };
}

export function ShopeeAuth({ adminSecretValue }: { adminSecretValue: string }) {
  const hasAdmin = useMemo(() => (adminSecretValue || '').trim().length > 0, [adminSecretValue]);

  const [status, setStatus] = useState<ShopeeOauthStatus | null>(null);
  const [authorizeInfo, setAuthorizeInfo] = useState<AuthorizeUrlResponse | null>(null);
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeResponse | null>(null);

  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [awaitingPopupClose, setAwaitingPopupClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const popupWatchRef = useRef<number | null>(null);

  const statusBadge = useMemo(() => statusLabel(status), [status]);

  async function fetchStatus(opts?: { silent?: boolean }) {
    if (!hasAdmin) {
      setStatus(null);
      return;
    }

    if (!opts?.silent) setPolling(true);
    setError(null);

    try {
      const { data } = await api.get<{ success: true } & ShopeeOauthStatus>('/api/shopee/token-status');
      setStatus(data);
      setLastUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      if (!opts?.silent) setPolling(false);
    }
  }

  async function openAuthorize() {
    setError(null);
    setBusy(true);
    setExchangeInfo(null);

    try {
      const { data } = await api.get<{ success: true } & AuthorizeUrlResponse>('/api/shopee/oauth/authorize-url');
      setAuthorizeInfo({ redirectUrl: data.redirectUrl, url: data.url });

      console.log('[Shopee OAuth] Popup aberto');

      const popup = window.open(data.url, 'shopee_oauth', 'width=900,height=800');
      if (!popup) {
        setAwaitingPopupClose(false);
        return;
      }

      setAwaitingPopupClose(true);

      if (popupWatchRef.current) window.clearInterval(popupWatchRef.current);
      popupWatchRef.current = window.setInterval(() => {
        try {
          if (popup.closed) {
            if (popupWatchRef.current) window.clearInterval(popupWatchRef.current);
            popupWatchRef.current = null;
            setAwaitingPopupClose(false);
            console.log('[Shopee OAuth] Popup fechado');
          }
        } catch {
          // noop
        }
      }, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exchangeCode(payload?: { code?: string; shop_id?: string; main_account_id?: string }) {
    setError(null);
    setBusy(true);
    try {
      const body = payload?.code ? payload : {};
      const { data } = await api.post<{ success: true } & ExchangeResponse>('/api/shopee/oauth/exchange', body);
      setExchangeInfo(data);
      await fetchStatus({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshNow() {
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/shopee/oauth/refresh', {});
      await fetchStatus({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdmin]);

  useEffect(() => {
    if (!hasAdmin) return;

    const id = window.setInterval(() => {
      void fetchStatus({ silent: true });
    }, 30_000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdmin]);

  useEffect(() => {
    return () => {
      if (popupWatchRef.current) window.clearInterval(popupWatchRef.current);
      popupWatchRef.current = null;
    };
  }, []);

  // Receber code via postMessage (quando o callback volta no popup).
  useEffect(() => {
    if (!hasAdmin) return;

    function onMessage(evt: MessageEvent) {
      if (evt.origin !== window.location.origin) return;
      const data = evt.data as any;
      if (!data || data.type !== 'SHOPEE_CODE' || typeof data.code !== 'string') return;

      console.log('[Shopee OAuth] Code recebido na aba principal');
      void exchangeCode({
        code: data.code,
        shop_id: typeof data.shop_id === 'string' ? data.shop_id : undefined,
        main_account_id: typeof data.main_account_id === 'string' ? data.main_account_id : undefined,
      });
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdmin]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Shopee OAuth</div>
          <div className="mt-1 text-sm text-slate-600">Autorize a Shopee, veja status dos tokens e reautorize quando necessário.</div>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => fetchStatus()}
            disabled={!hasAdmin || busy || polling}
          >
            {polling ? 'Atualizando…' : 'Atualizar status'}
          </button>
        </div>
      </div>

      {!hasAdmin ? (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Para liberar as ações e visualizar status, informe o <span className="font-mono">OAUTH_ADMIN_SECRET</span> acima.
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600">Status:</span>
          <span
            className={
              statusBadge.tone === 'ok'
                ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                : statusBadge.tone === 'err'
                  ? 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800'
                  : 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800'
            }
          >
            {statusBadge.label}
          </span>
          {lastUpdatedAt ? <span className="text-xs text-slate-500">Atualizado: {lastUpdatedAt.toLocaleTimeString()}</span> : null}
        </div>

        <div>
          Fonte: <span className="font-mono">{status?.source ?? '-'}</span>
        </div>
        <div>
          Shop ID: <span className="font-mono">{status?.shopId ?? '-'}</span>
        </div>
        <div>
          Access token: <span className="font-mono">{status?.accessTokenMasked ?? '-'}</span>
        </div>
        <div>
          Refresh token: <span className="font-mono">{status?.refreshTokenMasked ?? '-'}</span>
        </div>

        <div className="mt-1 grid gap-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-800">
          <div>
            Access válido até: <span className="font-mono">{formatDateTime(status?.accessTokenExpiresAt ?? null)}</span>
            {typeof status?.accessTokenDaysLeft === 'number' ? (
              <span className="ml-2 text-slate-600">({status.accessTokenDaysLeft}d)</span>
            ) : null}
          </div>
          <div>
            Refresh válido até: <span className="font-mono">{formatDateTime(status?.refreshTokenExpiresAt ?? null)}</span>
            {typeof status?.refreshTokenDaysLeft === 'number' ? (
              <span className="ml-2 text-slate-600">({status.refreshTokenDaysLeft}d)</span>
            ) : null}
          </div>
          <div>
            Último refresh: <span className="font-mono">{formatDateTime(status?.lastRefreshAt ?? null)}</span>
          </div>
        </div>

        {status?.refreshTokenWillExpireSoon ? (
          <div className="mt-1 text-sm font-semibold text-amber-700">Atenção: refresh token perto de expirar.</div>
        ) : null}

        {status?.lastRefreshError ? (
          <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Último erro: {status.lastRefreshError}</div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Autorizar / Reautorizar</div>
        <div className="mt-1 text-sm text-slate-600">
          1) Clique em <span className="font-semibold">Autorizar Shopee</span> e conclua no popup. 2) Ao fechar o popup, o sistema tenta concluir automaticamente.
          Se necessário, clique em <span className="font-semibold">Concluir autorização</span>.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            onClick={openAuthorize}
            disabled={!hasAdmin || busy}
          >
            {awaitingPopupClose ? 'Aguardando autorização…' : 'Autorizar Shopee'}
          </button>

          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            onClick={() => exchangeCode()}
            disabled={!hasAdmin || busy}
          >
            Concluir autorização
          </button>

          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            onClick={refreshNow}
            disabled={!hasAdmin || busy}
          >
            Refresh agora
          </button>
        </div>

        {authorizeInfo ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            <div>
              Redirect URL: <span className="font-mono">{authorizeInfo.redirectUrl}</span>
            </div>
            <div className="mt-1">
              Se o popup for bloqueado, abra manualmente: <a className="break-all font-mono underline" href={authorizeInfo.url} target="_blank" rel="noreferrer">{authorizeInfo.url}</a>
            </div>
          </div>
        ) : null}

        {exchangeInfo ? (
          <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
            Autorização concluída: access={exchangeInfo.accessTokenMasked} refresh={exchangeInfo.refreshTokenMasked}
          </div>
        ) : null}
      </div>

      {status?.scheduler ? (
        <div className="mt-4 rounded-xl bg-slate-900 p-3 text-xs text-slate-200">
          <div className="text-white">Auto-refresh (backend)</div>
          <div className="mt-1 grid gap-1">
            <div>
              Enabled: <span className="font-mono">{String(status.scheduler.enabled)}</span>
            </div>
            <div>
              Cron: <span className="font-mono">{status.scheduler.cron ?? '-'}</span>
            </div>
            <div>
              ifExpiringInSec: <span className="font-mono">{status.scheduler.ifExpiringInSec ?? '-'}</span>
            </div>
            <div>
              forceRefreshTokenInDays: <span className="font-mono">{status.scheduler.forceRefreshTokenInDays ?? '-'}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
