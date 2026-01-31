import { create } from 'zustand';
import { User } from '../services/auth';
import { databaseService } from '../services/database';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    login: (user: User) => Promise<void>;
    logout: () => Promise<void>;
    loadUserFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    login: async (user) => {
        await databaseService.saveAppData('user_profile', user);
        set({ user, isAuthenticated: true });
    },
    logout: async () => {
        await databaseService.saveAppData('user_profile', null);
        set({ user: null, isAuthenticated: false });
    },
    loadUserFromStorage: async () => {
        try {
            const user = await databaseService.getAppData<User>('user_profile');
            if (user) {
                set({ user, isAuthenticated: true });
            }
        } catch (error) {
            console.error('[AuthStore] Failed to load user from storage', error);
        }
    }
}));
