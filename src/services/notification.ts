import notifee, { AndroidImportance, AndroidColor } from '@notifee/react-native';

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
}

export const notificationService = new NotificationService();
