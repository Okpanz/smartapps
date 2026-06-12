import axios from 'axios';
import { EXPO_PUBLIC_API_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenCache } from '../utils/tokenCache';
import { useAuthStore } from '../hooks/useAuthStore';

const BASE_URL = EXPO_PUBLIC_API_URL || 'https://api.smartverification.ng/api';
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1500;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15_000,
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
};

// ─── Request interceptor ──────────────────────────────────────────────────────
// Reads the token from in-memory cache (sync, zero I/O). Falls back to
// AsyncStorage only on the very first request after a cold app restart, before
// loadUserFromStorage has had a chance to populate the cache.
api.interceptors.request.use(
  async (config) => {
    const token = tokenCache.get() ?? (await AsyncStorage.getItem('userToken'));
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // Warm the cache for subsequent requests
      if (!tokenCache.get()) tokenCache.set(token);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config: any = error.config;

    if (error.response) {
      if (error.response.status === 401 && !config._retry) {
        // Do not attempt token refresh for auth endpoints themselves
        if (
          config.url?.includes('/auth/sign-in') ||
          config.url?.includes('/auth/refresh-token')
        ) {
          return Promise.reject(error);
        }

        if (isRefreshing) {
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            config.headers.Authorization = `Bearer ${token}`;
            return api(config);
          });
        }

        config._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = await AsyncStorage.getItem('refreshToken');
          if (!refreshToken) throw new Error('No refresh token');

          const res = await api.post('/auth/refresh-token', { refreshToken });
          const { token: newToken, refreshToken: newRefreshToken, user } = res.data.data;

          await AsyncStorage.setItem('userToken', newToken);
          if (newRefreshToken) await AsyncStorage.setItem('refreshToken', newRefreshToken);
          await AsyncStorage.setItem('userData', JSON.stringify(user));
          tokenCache.set(newToken);

          useAuthStore.getState().login(user);
          processQueue(null, newToken);
          config.headers.Authorization = `Bearer ${newToken}`;
          return api(config);
        } catch (refreshError) {
          processQueue(refreshError, null);
          tokenCache.clear();
          await useAuthStore.getState().logout();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // Retry on network errors and 5xx responses (not on 4xx or explicit no-retry)
    const shouldRetry =
      (!error.response || (error.response.status >= 500 && error.response.status < 600)) &&
      config &&
      !config._doNotRetry;

    if (!shouldRetry) return Promise.reject(error);

    config._retryCount = (config._retryCount || 0) + 1;
    if (config._retryCount > MAX_RETRIES) return Promise.reject(error);

    await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * config._retryCount));
    return api(config);
  }
);

export default api;
