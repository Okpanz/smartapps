import { create } from 'zustand';
import { fetchFeatureFlags, FeatureFlagsMap } from '../services/featureFlags';
import { useAuthStore } from './useAuthStore';

type State = {
  flags: FeatureFlagsMap;
  loaded: boolean;
  loading: boolean;
  fetchForCurrentService: () => Promise<void>;
  get: (key: string, defaultValue?: boolean) => boolean;
};

export const useFeatureFlags = create<State>((set, getState) => ({
  flags: {},
  loaded: false,
  loading: false,
  async fetchForCurrentService() {
    if (getState().loading) return;
    set({ loading: true });
    try {
      const user = useAuthStore.getState().user;
      const serviceId = user?.service_id ? String(user.service_id) : undefined;
      const flags = await fetchFeatureFlags('smartapps', serviceId);
      set({ flags, loaded: true, loading: false });
    } catch (e) {
      set({ loaded: true, loading: false });
    }
  },
  get(key: string, defaultValue: boolean = false) {
    const v = getState().flags[key];
    return typeof v === 'boolean' ? v : defaultValue;
  }
}));
