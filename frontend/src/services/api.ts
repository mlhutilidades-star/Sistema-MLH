import axios from 'axios';

export const DEFAULT_API_BASE_URL = 'https://api-backend-production-af22.up.railway.app';

function normalizeBaseUrl(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

    // Defensive: in production, ignore overrides that point back to the frontend itself.
    // (Common misconfig: setting API base to the frontend URL, which will return 404/empty.)
    const frontendHost = typeof window !== 'undefined' ? window.location.hostname : '';
    if (frontendHost && u.hostname === frontendHost) return null;

    // Also ignore localhost overrides when not running on localhost.
    if (frontendHost && frontendHost !== 'localhost' && u.hostname === 'localhost') return null;

    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const fromStorageRaw = localStorage.getItem('mlh_api_base_url') || undefined;

  const envNormalized = fromEnv ? normalizeBaseUrl(fromEnv) : null;
  const storageNormalized = fromStorageRaw ? normalizeBaseUrl(fromStorageRaw) : null;

  return (envNormalized || storageNormalized || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

export function getAdminSecret(): string | null {
  const fromEnv = import.meta.env.VITE_ADMIN_SECRET as string | undefined;
  const fromStorage = localStorage.getItem('mlh_admin_secret') || undefined;
  const secret = (fromEnv || fromStorage || '').trim();
  return secret.length > 0 ? secret : null;
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  // Atualiza baseURL dinamicamente (permite trocar em runtime pelo Config)
  config.baseURL = getApiBaseUrl();

  const secret = getAdminSecret();
  if (secret) {
    config.headers = config.headers ?? {};
    (config.headers as any)['x-admin-secret'] = secret;
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Erro na API';

    const wrapped = new Error(String(message));
    (wrapped as any).cause = error;
    throw wrapped;
  },
);

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
