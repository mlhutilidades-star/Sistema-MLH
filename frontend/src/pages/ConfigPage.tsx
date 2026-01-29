import { useEffect, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { api, getApiBaseUrl, getAdminSecret } from '../services/api';
import { ShopeeAuth } from '../components/ShopeeAuth';

type AuthUiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export function ConfigPage() {
  const apiBase = useLocalStorage('mlh_api_base_url', getApiBaseUrl());
  const adminSecret = useLocalStorage('mlh_admin_secret', getAdminSecret() || '');

  const [shopeeAuthState, setShopeeAuthState] = useState<AuthUiState>({ status: 'idle' });

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('shopee_code');
    const shopId = url.searchParams.get('shop_id') || undefined;
    const mainAccountId = url.searchParams.get('main_account_id') || undefined;

    if (!code) return;

    const codePrefix = `${code.slice(0, 10)}...`;
    const now = Date.now();
    const usedKey = 'mlh_shopee_oauth_code_used';
    const usedAtKey = 'mlh_shopee_oauth_code_used_at';
    const alreadyUsed = sessionStorage.getItem(usedKey);
    const alreadyUsedAtRaw = sessionStorage.getItem(usedAtKey);
    const alreadyUsedAt = alreadyUsedAtRaw ? Number(alreadyUsedAtRaw) : null;

    if (alreadyUsed === code) {
      console.log('[Shopee OAuth] Code já foi processado nesta sessão; ignorando:', codePrefix);
      return;
    }

    // Mark as seen/used early to avoid double-processing on fast reloads.
    sessionStorage.setItem(usedKey, code);
    sessionStorage.setItem(usedAtKey, String(now));

    if (typeof alreadyUsedAt === 'number' && Number.isFinite(alreadyUsedAt) && now - alreadyUsedAt > 9 * 60_000) {
      setShopeeAuthState({ status: 'error', message: 'Code expirado (>= 9min). Clique em Autorizar Shopee e tente novamente.' });
      return;
    }

    console.log('[Shopee OAuth] Callback recebido, code:', codePrefix, `(len=${code.length})`);

    // Sempre remover o code da URL (evita reprocessar em refresh/back).
    url.searchParams.delete('shopee_code');
    url.searchParams.delete('shop_id');
    url.searchParams.delete('main_account_id');
    url.searchParams.delete('shopee_oauth_error');
    window.history.replaceState({}, '', url.toString());

    // Se estamos no popup, mandar o code para a aba principal e fechar.
    try {
      if (window.opener && window.opener !== window) {
        console.log('[Shopee OAuth] Popup detectado, enviando postMessage para opener');
        window.opener.postMessage(
          { type: 'SHOPEE_CODE', code, shop_id: shopId, main_account_id: mainAccountId },
          window.location.origin,
        );
        console.log('[Shopee OAuth] postMessage enviado, fechando popup');
        window.close();
        return;
      }
    } catch (e) {
      console.log('[Shopee OAuth] Falha ao usar opener/postMessage, seguindo fluxo direto', e);
    }

    // Caso (sem popup): processar na própria aba.
    void (async () => {
      try {
        console.log('[Shopee OAuth] Iniciando exchange com code:', codePrefix);
        setShopeeAuthState({ status: 'loading' });

        const secret = (getAdminSecret() || '').trim();
        if (!secret) {
          throw new Error('Informe o OAUTH_ADMIN_SECRET para concluir a autorização.');
        }

        const res = await api.post('/api/shopee/oauth/exchange', {
          code,
          shop_id: shopId,
          main_account_id: mainAccountId,
        });

        console.log('[Shopee OAuth] Resposta do exchange:', res.status, res.data);

        console.log('[Shopee OAuth] Tokens salvos com sucesso');
        setShopeeAuthState({ status: 'success', message: 'Autorizado! Tokens salvos com sucesso.' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log('[Shopee OAuth] Erro no exchange:', err);
        setShopeeAuthState({ status: 'error', message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6">
      {shopeeAuthState.status === 'loading' ? (
        <div className="rounded-2xl bg-slate-900 p-4 text-sm font-semibold text-white shadow-sm">Autorizando Shopee…</div>
      ) : null}
      {shopeeAuthState.status === 'success' ? (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 shadow-sm">
          {shopeeAuthState.message}
        </div>
      ) : null}
      {shopeeAuthState.status === 'error' ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-900 shadow-sm">
          Erro ao autorizar: {shopeeAuthState.message}
        </div>
      ) : null}

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
