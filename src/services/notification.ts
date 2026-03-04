import notifee, { AndroidImportance, AndroidColor } from '@notifee/react-native';
import { io, Socket } from 'socket.io-client';
import api from './api';
import { useAuthStore } from '../hooks/useAuthStore';

// In-memory de-duplication store for notifications
const recentNotifs = new Map<string, number>();
const NOTIF_TTL_MS = 15000; // 15s window to ignore duplicates

function fingerprint(payload: any): string {
  const title = String(payload?.title || '');
  const message = String(payload?.message || '');
  const createdAt = String(payload?.createdAt || '');
  const importance = String(payload?.importance || '');
  const app = String(payload?.app || '');
  const service = String(payload?.service_id || '');
  return `${createdAt}|${importance}|${app}|${service}|${title}|${message}`;
}

function seenRecently(key: string): boolean {
  const now = Date.now();
  const ts = recentNotifs.get(key);
  // prune old
  for (const [k, t] of recentNotifs) {
    if (now - t > NOTIF_TTL_MS) recentNotifs.delete(k);
  }
  if (ts && now - ts <= NOTIF_TTL_MS) return true;
  recentNotifs.set(key, now);
  // bound size
  if (recentNotifs.size > 200) {
    // remove oldest entries
    const entries = Array.from(recentNotifs.entries()).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < entries.length - 200; i++) {
      recentNotifs.delete(entries[i][0]);
    }
  }
  return false;
}

class NotificationService {
  constructor() {
    this.configure();
  }

  async configure() {
    await notifee.requestPermission();
    await this.createChannels();
  }

  async createChannels() {
    // 1. Channel for silent background progress (downloading/uploading)
    await notifee.createChannel({
      id: 'sync_progress_v2',
      name: 'Sync Progress',
      importance: AndroidImportance.LOW,
      sound: undefined,
      vibration: false,
    });

    // 2. Channel for important sync results (Completed/Failed) - MUST POP
    await notifee.createChannel({
      id: 'sync_alerts_v2',
      name: 'Sync Alerts',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });

    // 3. Channel for Connectivity - MUST POP
    await notifee.createChannel({
      id: 'connectivity_heads_up',
      name: 'Connectivity Alerts',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });

    // 4. Channel for Offline Actions - MUST POP
    await notifee.createChannel({
      id: 'offline_uploads_v2',
      name: 'Offline Uploads',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });
  }

  async notifyInternetRestored() {
    await notifee.displayNotification({
      title: 'Internet Restored',
      body: 'You are back online. Syncing pending data...',
      android: {
        channelId: 'connectivity_heads_up',
        importance: AndroidImportance.HIGH,
        color: AndroidColor.GREEN,
        smallIcon: 'ic_launcher',
        pressAction: {
          id: 'default',
        },
      },
    });
  }

  async notifySyncStatus(status: 'syncing' | 'downloading' | 'completed' | 'failed', details?: string) {
    let title = 'Sync Status';
    let body = '';
    let color = AndroidColor.BLUE;
    let channelId = 'sync_progress_v2';
    let importance = AndroidImportance.LOW;

    switch (status) {
      case 'syncing':
        title = 'Syncing Uploads';
        body = details || 'Uploading pending records...';
        channelId = 'sync_progress_v2';
        importance = AndroidImportance.LOW;
        break;
      case 'downloading':
        title = 'Syncing Data';
        body = 'Downloading offline records...';
        channelId = 'sync_progress_v2';
        importance = AndroidImportance.LOW;
        break;
      case 'completed':
        title = 'Sync Completed';
        body = details || 'Offline records updated successfully.';
        color = AndroidColor.GREEN;
        channelId = 'sync_alerts_v2'; // High priority
        importance = AndroidImportance.HIGH;
        break;
      case 'failed':
        title = 'Sync Failed';
        body = details || 'Could not update offline records.';
        color = AndroidColor.RED;
        channelId = 'sync_alerts_v2'; // High priority
        importance = AndroidImportance.HIGH;
        break;
    }

    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId,
        color,
        importance,
        smallIcon: 'ic_launcher',
        // Add pressAction to ensure heads-up works for high priority
        pressAction: importance === AndroidImportance.HIGH ? { id: 'default' } : undefined,
      },
    });
  }

  async notifyOfflineUploadSaved() {
    await notifee.displayNotification({
      title: 'Verification Saved Offline',
      body: 'Data saved locally. Will upload automatically when online.',
      android: {
        channelId: 'offline_uploads_v2',
        importance: AndroidImportance.HIGH,
        color: AndroidColor.TEAL,
        smallIcon: 'ic_launcher',
        pressAction: {
          id: 'default',
        },
      },
    });
  }

  async notifyMessage(title: string, body: string, importance: 'low' | 'normal' | 'high' = 'normal') {
    const isHigh = importance === 'high';
    const channelId = isHigh ? 'sync_alerts_v2' : 'sync_progress_v2';
    const imp = isHigh ? AndroidImportance.HIGH : AndroidImportance.LOW;
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId,
        importance: imp,
        smallIcon: 'ic_launcher',
        pressAction: isHigh ? { id: 'default' } : undefined,
      },
    });
  }
}

export const notificationService = new NotificationService();

let activeUnsub: null | (() => void) = null;
export function subscribeNotifications(): () => void {
  try {
    // Ensure only one active subscription at a time
    if (activeUnsub) {
      try { activeUnsub(); } catch {}
      activeUnsub = null;
    }
    const baseURL = api.defaults.baseURL || '';
    const user = useAuthStore.getState().user;
    const serviceId = user?.service_id ? String(user.service_id) : undefined;
    let socketUrl: string;
    try {
      const u = new URL(baseURL);
      socketUrl = `${u.protocol}//${u.host}`;
    } catch {
      const hostOnly = baseURL.replace(/^https?:\/\//, '').split('/')[0];
      const isHttps = baseURL.startsWith('https://');
      socketUrl = `${isHttps ? 'https://' : 'http://'}${hostOnly}`;
    }
    const appKeys = ['smartapps', 'smartverifyMobile'];
    const sockets: Socket[] = [];
    const handlers = new Map<Socket, (payload: any) => void>();
    for (const app of appKeys) {
      const query: any = { app };
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
      const handler = async (payload: any) => {
        const appKey: string | undefined = typeof payload?.app === 'string' ? payload.app : undefined;
        if (appKey && !appKeys.includes(appKey)) return;
        const userSvc = useAuthStore.getState().user?.service_id ? String(useAuthStore.getState().user?.service_id) : undefined;
        if (payload?.service_id && userSvc && String(payload.service_id) !== String(userSvc)) return;
        const fp = fingerprint(payload);
        if (seenRecently(fp)) return;
        const title = String(payload?.title || 'Notification');
        const message = String(payload?.message || '');
        const imp = (payload?.importance === 'high' || payload?.importance === 'low') ? payload.importance : 'normal';
        await notificationService.notifyMessage(title, message, imp);
      };
      socket.on('notifications:new', handler);
      sockets.push(socket);
      handlers.set(socket, handler);
    }
    console.log('[Socket] notifications:new subscribe');
    const cleanup = () => {
      for (const s of sockets) {
        try {
          const h = handlers.get(s);
          if (h) s.off('notifications:new', h);
          s.close();
        } catch {}
      }
    };
    activeUnsub = cleanup;
    return cleanup;
  } catch {
    return () => {};
  }
}
