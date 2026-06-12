import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../services/auth';
import { databaseService } from '../services/database';
import { tokenCache } from '../utils/tokenCache';
import { logger } from '../utils/logger';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  syncProgress: number;
  uploadStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncTime: Date | null;
  pendingUploadsCount: number;

  login: (user: User) => Promise<void>;
  logout: () => Promise<void>;
  loadUserFromStorage: () => Promise<void>;
  setSyncStatus: (status: AuthState['syncStatus']) => void;
  setSyncProgress: (progress: number) => void;
  setUploadStatus: (status: AuthState['uploadStatus']) => void;
  setLastSyncTime: (time: Date) => void;
  setPendingUploadsCount: (count: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  syncStatus: 'idle',
  syncProgress: 0,
  uploadStatus: 'idle',
  lastSyncTime: null,
  pendingUploadsCount: 0,

  login: async (user) => {
    await databaseService.saveAppData('user_profile', user);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    // Clear auth tokens from memory first
    tokenCache.clear();

    // Clear AsyncStorage — include pendingEnrollments (legacy key) to prevent
    // data leakage when another user logs into the same device
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(
        (k) =>
          k === 'userToken' ||
          k === 'refreshToken' ||
          k === 'userData' ||
          k === 'employeesData' ||
          k === 'pendingEnrollments' ||          // legacy offline queue
          k.startsWith('offline_sync_cursor_') || // leftover download cursors
          k.startsWith('sync_failure_')           // leftover cooldown timestamps
      );
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch (e) {
      logger.error('[AuthStore] Failed to clear AsyncStorage on logout', e);
    }

    // Clear SQLite — employee records and pending enrollments from this session
    try {
      await databaseService.saveAppData('user_profile', null);
      await databaseService.clearDatabase();
      await databaseService.clearAllPendingEnrollments();
    } catch (e) {
      logger.error('[AuthStore] Failed to clear SQLite on logout', e);
    }

    set({
      user: null,
      isAuthenticated: false,
      syncStatus: 'idle',
      syncProgress: 0,
      uploadStatus: 'idle',
      lastSyncTime: null,
      pendingUploadsCount: 0,
    });
  },

  loadUserFromStorage: async () => {
    try {
      logger.debug('[AuthStore] Loading user from storage');

      const [token, userDataStr] = await Promise.all([
        AsyncStorage.getItem('userToken'),
        AsyncStorage.getItem('userData'),
      ]);

      // Populate in-memory token cache so subsequent API requests skip disk I/O
      if (token) tokenCache.set(token);

      // Prefer SQLite-persisted profile; fall back to AsyncStorage
      const dbUser = await databaseService.getAppData<User>('user_profile');

      if (dbUser && token) {
        set({ user: dbUser, isAuthenticated: true });
        return;
      }

      if (userDataStr && token) {
        const userData: User = JSON.parse(userDataStr);
        set({ user: userData, isAuthenticated: true });
        // Backfill SQLite for consistency
        await databaseService.saveAppData('user_profile', userData);
        return;
      }

      if (dbUser && !token) {
        // Profile exists but token is gone — require re-authentication
        set({ user: dbUser, isAuthenticated: false });
        return;
      }

      set({ user: null, isAuthenticated: false });
    } catch (error) {
      logger.error('[AuthStore] Failed to load user from storage', error);
      set({ user: null, isAuthenticated: false });
    }
  },

  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setSyncProgress: (syncProgress) => set({ syncProgress }),
  setUploadStatus: (uploadStatus) => set({ uploadStatus }),
  setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
  setPendingUploadsCount: (pendingUploadsCount) => set({ pendingUploadsCount }),
}));
