import { create } from 'zustand';
import { User } from '../services/auth';
import { databaseService } from '../services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    syncStatus: 'idle' | 'syncing' | 'success' | 'error';
    syncProgress: number; // 0-100
    uploadStatus: 'idle' | 'syncing' | 'success' | 'error';
    lastSyncTime: Date | null;
    pendingUploadsCount: number;
    login: (user: User) => Promise<void>;
    logout: () => Promise<void>;
    loadUserFromStorage: () => Promise<void>;
    setSyncStatus: (status: 'idle' | 'syncing' | 'success' | 'error') => void;
    setSyncProgress: (progress: number) => void;
    setUploadStatus: (status: 'idle' | 'syncing' | 'success' | 'error') => void;
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
        try {
            await databaseService.saveAppData('user_profile', null);
        } catch (e) {
            console.error('[AuthStore] Failed to clear user profile from DB', e);
        }

        try {
            await AsyncStorage.multiRemove(['userToken', 'userData', 'employeesData']);
        } catch (e) {
            console.error('[AuthStore] Failed to clear AsyncStorage', e);
        }

        set({ user: null, isAuthenticated: false, syncStatus: 'idle', syncProgress: 0, uploadStatus: 'idle', lastSyncTime: null, pendingUploadsCount: 0 });
    },
    loadUserFromStorage: async () => {
        try {
            console.log('[AuthStore] Loading user from storage...');
            
            // Load user from database
            const user = await databaseService.getAppData<User>('user_profile');
            
            // Also check AsyncStorage for token and userData as fallback
            const token = await AsyncStorage.getItem('userToken');
            const userDataStr = await AsyncStorage.getItem('userData');
            
            if (user && token) {
                console.log('[AuthStore] User and token found in storage, setting authenticated state');
                set({ user, isAuthenticated: true });
            } else if (userDataStr && token) {
                console.log('[AuthStore] User found in AsyncStorage fallback, setting authenticated state');
                const userData = JSON.parse(userDataStr);
                set({ user: userData, isAuthenticated: true });
                // Also save to database for consistency
                await databaseService.saveAppData('user_profile', userData);
            } else if (user && !token) {
                console.log('[AuthStore] User found but no token - user needs to re-authenticate');
                set({ user, isAuthenticated: false });
            } else {
                console.log('[AuthStore] No user or token found in storage');
                set({ user: null, isAuthenticated: false });
            }
        } catch (error) {
            console.error('[AuthStore] Failed to load user from storage', error);
            set({ user: null, isAuthenticated: false });
        }
    },
    setSyncStatus: (status) => set({ syncStatus: status }),
    setSyncProgress: (progress) => set({ syncProgress: progress }),
    setUploadStatus: (status) => set({ uploadStatus: status }),
    setLastSyncTime: (time) => set({ lastSyncTime: time }),
    setPendingUploadsCount: (count) => set({ pendingUploadsCount: count }),
}));
