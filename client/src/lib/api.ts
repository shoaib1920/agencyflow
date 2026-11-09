import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/stores/auth';
import type { ApiResponse, User } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true, // send the httpOnly refresh cookie
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Single-flight refresh: if several requests 401 at once, they all wait on the
 * same /auth/refresh call instead of each rotating the token (which would trip
 * the server's reuse detection and log the user out).
 */
let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= axios
    .post<ApiResponse<{ user: User; accessToken: string }>>(
      `${API_URL}/api/auth/refresh`,
      {},
      { withCredentials: true },
    )
    .then(({ data }) => {
      useAuth.getState().setSession(data.data.user, data.data.accessToken);
      return data.data.accessToken;
    })
    .catch(() => {
      useAuth.getState().clear();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Pull a human-readable message out of our `{ success, message }` error envelope. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Partial<ApiResponse<unknown>> | undefined;
    const fieldErrors = data?.meta?.errors;
    if (fieldErrors) {
      const first = Object.entries(fieldErrors)[0];
      if (first) return `${first[0]}: ${first[1][0]}`;
    }
    return data?.message ?? err.message ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

/** Unwrap `{ data }` for simple GETs. */
export async function get<T>(url: string, params?: object): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url, { params });
  return data.data;
}

export async function getPage<T>(url: string, params?: object) {
  const { data } = await api.get<ApiResponse<T[]>>(url, { params });
  return { items: data.data, meta: data.meta ?? {} };
}
