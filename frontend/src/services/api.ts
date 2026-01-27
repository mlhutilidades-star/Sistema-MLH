import axios from 'axios';

const DEFAULT_API_BASE_URL = 'https://api-backend-production-af22.up.railway.app';

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const fromStorage = localStorage.getItem('mlh_api_base_url') || undefined;
  const base = (fromEnv || fromStorage || DEFAULT_API_BASE_URL).trim();
  return base.replace(/\/+$/, '');
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
