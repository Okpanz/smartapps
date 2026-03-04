import api from './api';
import { io, Socket } from 'socket.io-client';

let cache: Record<string, boolean> = {};

function getSocketBase() {
  const base = String((api.defaults as any)?.baseURL || '');
  if (!base) return undefined;
  try {
    const u = new URL(base);
    if (u.pathname.endsWith('/api')) u.pathname = u.pathname.slice(0, -4);
    return `${u.protocol}//${u.host}`;
  } catch {
    return base.replace(/\/api\/?$/, '');
  }
}

export async function fetchFeatureFlags(serviceId?: string | number) {
  const res = await api.get('/feature-flags', {
    params: { app: 'smartapps', ...(serviceId ? { serviceId } : {}) },
  });
  const list = Array.isArray(res.data?.data) ? res.data.data : [];
  const map: Record<string, boolean> = {};
  for (const f of list) {
    if (f && typeof f.key === 'string') {
      map[f.key] = Boolean(f.enabled);
    }
  }
  if (map['i_am_alived'] !== undefined) {
    map['i_am_alive_enabled'] = map['i_am_alived'];
  }
  cache = map;
  return cache;
}

export function isEnabled(key: string) {
  return Boolean(cache[key]);
}

export function subscribeFeatureFlags(serviceId?: string | number) {
  const base = getSocketBase();
  if (!base) return () => {};
  const socket: Socket = io(base, {
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    withCredentials: true,
    forceNew: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    query: {
      app: 'smartapps',
      ...(serviceId ? { serviceId: String(serviceId) } : {}),
    },
  });
  socket.on('featureFlags:changed', (payload: unknown) => {
    const p = payload as { app?: unknown } | null;
    const payloadApp = typeof p?.app === 'string' ? p.app : undefined;
    if (payloadApp && payloadApp !== 'smartapps') return;
    fetchFeatureFlags(serviceId).catch(() => {});
  });
  socket.on('connect_error', () => {
    fetchFeatureFlags(serviceId).catch(() => {});
  });
  const pollId = setInterval(() => {
    fetchFeatureFlags(serviceId).catch(() => {});
  }, 30000);
  return () => {
    clearInterval(pollId);
    socket.disconnect();
  };
}
