import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getUniqueId } from 'react-native-device-info';
import api from './api';
import { databaseService } from './database';
import { notificationService } from './notification';
import { tokenCache } from '../utils/tokenCache';
import { logger } from '../utils/logger';
import { useAuthStore } from '../hooks/useAuthStore';

export interface User {
  id: string;
  username: string;
  name: string;
  email?: string;
  role?: string;
  service_id?: number;
  [key: string]: any;
}

interface LoginResponse {
  success: boolean;
  message: string;
  statusCode: number;
  data: any;
}

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = async (username: string, password: string): Promise<User> => {
  logger.debug(`[Auth] Logging in: ${username}`);
  try {
    const deviceId = await getUniqueId();
    const response = await api.post<LoginResponse>('/auth/sign-in', {
      email: username,
      password,
      device_id: deviceId,
    });

    if (response.data.success && response.data.data?.token) {
      const { token, refreshToken, user, is_first_device_login } = response.data.data;

      await AsyncStorage.setItem('userToken', token);
      if (refreshToken) await AsyncStorage.setItem('refreshToken', refreshToken);

      // Populate in-memory token cache for zero-latency API requests
      tokenCache.set(token);

      const { id, ...rest } = user;
      const userData: User = {
        ...rest,
        id: String(id),
        username: user.email,
        name: user.name,
        email: user.email,
        service_id: user.service_id,
      };

      if (is_first_device_login) {
        userData.is_first_device_login = true;
      }

      await AsyncStorage.setItem('userData', JSON.stringify(userData));

      // Clear stale sync cursors that belong to a different service
      await clearStaleSyncCursors(userData.service_id);

      return userData;
    }

    let errorMessage = response.data.message || 'Login failed';
    if (response.data.data && typeof response.data.data === 'object') {
      const validationErrors = Object.values(response.data.data)
        .flat()
        .filter((m): m is string => typeof m === 'string');
      if (validationErrors.length > 0) errorMessage = validationErrors.join('\n');
    }
    throw new Error(errorMessage);
  } catch (error: any) {
    if (error.response) {
      throw new Error(`Login failed: ${error.response.data?.message || 'Server error'}`);
    } else if (error.request) {
      throw new Error('Login failed: Network error — could not reach server');
    }
    throw error;
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = async (): Promise<void> => {
  await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userData', 'employeesData']);
  tokenCache.clear();
};

// ─── Biometric login ──────────────────────────────────────────────────────────

export const biometricLogin = async (): Promise<User> => {
  try {
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No refresh token available');

    const response = await api.post<LoginResponse>('/auth/refresh-token', { refreshToken });

    if (response.data.success && response.data.data?.token) {
      const { token, refreshToken: newRefreshToken, user } = response.data.data;

      await AsyncStorage.setItem('userToken', token);
      if (newRefreshToken) await AsyncStorage.setItem('refreshToken', newRefreshToken);
      tokenCache.set(token);

      const { id, ...rest } = user;
      const userData: User = {
        ...rest,
        id: String(id),
        username: user.email,
        name: user.name,
        email: user.email,
        service_id: user.service_id,
      };
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      return userData;
    }

    throw new Error('Biometric login failed');
  } catch (error: any) {
    logger.error('[Auth] Biometric login error:', error);

    if (error.response?.status === 401) {
      // Expired credentials — force full re-login
      await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userData', 'employeesData']);
      tokenCache.clear();
      throw error;
    }

    // Network failure — allow offline access with a flag so the UI can suppress
    // non-essential API calls until a proper token refresh succeeds
    const isNetworkError =
      error.request ||
      error.message === 'Network Error' ||
      error.code === 'ECONNABORTED';

    if (isNetworkError) {
      logger.debug('[Auth] Network error during biometric login — attempting offline fallback');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (userDataStr) {
        const userData: User = JSON.parse(userDataStr);
        // Mark as offline session so the app suppresses token-dependent requests
        userData.offlineSession = true;
        return userData;
      }
    }

    throw error;
  }
};

// ─── Offline records download ─────────────────────────────────────────────────

export const downloadOfflineRecords = async (
  onProgress?: (count: number, percentage?: number) => void,
  serviceId?: string | number
): Promise<number> => {
  try {
    if (!serviceId) throw new Error('Service ID is required for downloading records');

    const lastFailureKey = `sync_failure_${serviceId}`;
    const lastFailureStr = await AsyncStorage.getItem(lastFailureKey);
    if (lastFailureStr) {
      const elapsed = Date.now() - parseInt(lastFailureStr, 10);
      if (elapsed < 5 * 60 * 1000) {
        logger.debug('[Offline Sync] Cooldown active — skipping');
        return 0;
      }
    }

    notificationService.notifySyncStatus('syncing', 'Downloading offline records...');

    const cursorKey = `offline_sync_cursor_${serviceId}`;
    const savedCursor = await AsyncStorage.getItem(cursorKey);

    let hasMore = true;
    let nextCursor: number | null = savedCursor ? JSON.parse(savedCursor) : null;

    if (!nextCursor) {
      logger.debug('[Offline Sync] Fresh download — clearing existing records');
      await databaseService.clearDatabase();
    }

    let totalSaved = await databaseService.getCount();
    let totalRecords = 0;

    while (hasMore) {
      let retries = 3;
      let response: any;

      while (retries > 0) {
        try {
          response = await api.get('/verification/download', {
            params: { service_id: serviceId, limit: 200, cursor: nextCursor },
            timeout: 60_000,
          });
          break;
        } catch (err: any) {
          const isRetryable =
            err.code === 'ECONNABORTED' ||
            err.response?.status === 504 ||
            err.message === 'Network Error';
          if (isRetryable && --retries > 0) {
            logger.warn(`[Offline Sync] Request failed — retrying (${3 - retries}/3)`);
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            throw err;
          }
        }
      }

      const body = response.data;
      if (body && (body.status || body.success)) {
        const responseData = body.data || body;
        const fetchedEmployees = responseData.employees || [];
        const pagination = responseData.pagination;

        hasMore = pagination?.has_more || false;
        nextCursor = pagination?.next_cursor ?? null;
        if (pagination?.total_records) totalRecords = Number(pagination.total_records);
        else if (pagination?.total) totalRecords = Number(pagination.total);

        if (fetchedEmployees.length > 0) {
          await databaseService.upsertEmployees(fetchedEmployees);
          totalSaved = await databaseService.getCount();

          if (nextCursor) {
            await AsyncStorage.setItem(cursorKey, JSON.stringify(nextCursor));
          }
        }

        const percentage =
          totalRecords > 0 ? Math.min(Math.round((totalSaved / totalRecords) * 100), 100) : 0;

        if (onProgress) onProgress(totalSaved, percentage);
        if (percentage > 0) {
          notificationService.notifySyncStatus('syncing', `Downloading... ${percentage}%`);
        }
        useAuthStore.getState().setSyncProgress(percentage);
      } else {
        hasMore = false;
      }
    }

    await AsyncStorage.removeItem(cursorKey);
    await AsyncStorage.removeItem(lastFailureKey);

    notificationService.notifySyncStatus('completed', `Downloaded ${totalSaved} records.`);
    return totalSaved;
  } catch (error: any) {
    const deviceId = await getUniqueId();
    logger.error(`[Offline Sync] Failed on device ${deviceId}:`, error.message);

    const lastFailureKey = `sync_failure_${serviceId}`;
    await AsyncStorage.setItem(lastFailureKey, Date.now().toString());
    notificationService.notifySyncStatus('failed', error.message);
    throw error;
  }
};

// ─── Clear offline records ────────────────────────────────────────────────────

export const clearOfflineRecords = async (serviceId?: string | number): Promise<void> => {
  await databaseService.clearDatabase();
  if (serviceId) {
    await AsyncStorage.multiRemove([
      `offline_sync_cursor_${serviceId}`,
      `sync_failure_${serviceId}`,
    ]);
  }
  notificationService.notifySyncStatus('completed', 'Offline records cleared.');
};

// ─── Profile / password / adhoc helpers ──────────────────────────────────────

export const updateProfile = async (data: any): Promise<any> => {
  const response = await api.put('/auth/profile', data);
  if (response.data?.success) return response.data.data;
  throw new Error(response.data?.message || 'Profile update failed');
};

export const changePassword = async (data: any): Promise<boolean> => {
  const response = await api.post('/auth/change-password', data);
  if (response.data?.success) return true;
  throw new Error(response.data?.message || 'Password change failed');
};

export const createAdhockStaff = async (userData: any): Promise<any> => {
  try {
    const response = await api.post('/auth/create-adhock-staff', userData);
    if (response.data?.success) return response.data.data;
    throw new Error(response.data?.message || 'Failed to create adhock staff');
  } catch (error: any) {
    const msg = error.response?.data?.message;
    throw new Error(msg || error.message);
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Removes AsyncStorage sync cursors and failure timestamps that belong to a
 * different service_id than the current user. Called after login to prevent
 * stale cursors accumulating across reassignments.
 */
const clearStaleSyncCursors = async (currentServiceId?: number | string): Promise<void> => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const staleKeys = allKeys.filter((k) => {
      if (!k.startsWith('offline_sync_cursor_') && !k.startsWith('sync_failure_')) return false;
      if (!currentServiceId) return true;
      return !k.endsWith(String(currentServiceId));
    });
    if (staleKeys.length > 0) {
      await AsyncStorage.multiRemove(staleKeys);
      logger.debug('[Auth] Cleared stale cursor keys:', staleKeys);
    }
  } catch (err) {
    logger.warn('[Auth] Failed to clear stale sync cursors (non-fatal):', err);
  }
};
