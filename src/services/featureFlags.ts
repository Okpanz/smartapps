import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../hooks/useAuthStore';
import { io, Socket } from 'socket.io-client';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

export type FeatureFlagsMap = Record<string, boolean>;

export async function fetchFeatureFlags(app?: string, serviceId?: string | number): Promise<FeatureFlagsMap> {
  const token = await AsyncStorage.getItem('userToken');
  const appKey = app || 'smartapps';
  const svc = serviceId ?? useAuthStore.getState().user?.service_id;
  const params: any = { app: appKey };
  if (svc !== undefined && svc !== null) params.serviceId = String(svc);
  const res = await api.get('/feature-flags', {
    params,
    headers: { Authorization: token ? `Bearer ${token}` : '' },
    _doNotRetry: true,
  } as any);
  const flags = res.data?.data || [];
  console.log('[FeatureFlags]', flags);
  const map: FeatureFlagsMap = {};
  for (const f of flags) {
    if (f && f.key) {
      map[String(f.key)] = Boolean(f.enabled);
    }
  }
  return map;
}

export function subscribeFeatureFlags(): () => void {
  try {
    const baseURL = api.defaults.baseURL || '';
    const user = useAuthStore.getState().user;
    const serviceId = user?.service_id ? String(user.service_id) : undefined;
    let socketUrl: string;
    try {
      const u = new URL(baseURL);
      // Always use origin (scheme+host+port), socket.io path is /socket.io
      socketUrl = `${u.protocol}//${u.host}`;
    } catch {
      // Fallback: strip any path segment like /api from the end
      const hostOnly = baseURL.replace(/^https?:\/\//, '').split('/')[0];
      const isHttps = baseURL.startsWith('https://');
      socketUrl = `${isHttps ? 'https://' : 'http://'}${hostOnly}`;
    }
    const query: any = { app: 'smartapps' };
    if (serviceId) query.serviceId = serviceId;

    const socket: Socket = io(socketUrl, {
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      query,
      withCredentials: true,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });

    const handler = (payload: any) => {
      const key: string | undefined = payload?.key;
      if (!key) return;
      // Filter by app and service scope
      const payloadApp: string | undefined = typeof payload?.app === 'string' ? payload.app : undefined;
      if (payloadApp && payloadApp !== 'smartapps') return;
      const userSvc = useAuthStore.getState().user?.service_id ? String(useAuthStore.getState().user?.service_id) : undefined;
      const svcMatchSingle = payload?.service_id ? String(payload.service_id) === userSvc : true;
      const svcMatchMulti = Array.isArray(payload?.service_ids) ? payload.service_ids.map((s: any) => String(s)).includes(String(userSvc)) : true;
      if (!(svcMatchSingle && svcMatchMulti)) return;
      // Apply update
      const { flags } = useFeatureFlags.getState();
      const next = { ...flags, [key]: Boolean(payload?.enabled) };
      useFeatureFlags.setState({ flags: next });
    };

    socket.on('featureFlags:changed', handler);
    console.log('[FeatureFlags] Subscribed to featureFlags:changed');
    return () => {
      try {
        socket.off('featureFlags:changed', handler);
        console.log('[FeatureFlags] Unsubscribed from featureFlags:changed');
        socket.close();
      } catch {}
    };
  } catch {
    return () => {};
  }
}
