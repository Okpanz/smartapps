import { Platform, NativeModules, Alert, DeviceEventEmitter, EmitterSubscription } from 'react-native';

const { ExternalScanner } = NativeModules;

export type ScannerStatus = 'DISCONNECTED' | 'CONNECTING' | 'INITIALIZING' | 'CONNECTED' | 'SCANNING' | 'ERROR';

export interface ScanResult {
    success: boolean;
    data?: string;
    preview?: string;
    error?: string;
    quality?: number;
    code?: string;
}

export interface UsbDevice {
    deviceId: number;
    deviceName: string;
    vendorId: number;
    productId: number;
    manufacturer?: string;
    product?: string;
}

class ExternalScannerService {
    private isConnected: boolean = false;
    private currentDeviceId: number | null = null;

    // Listen to logs
    onLog(callback: (log: string) => void): EmitterSubscription {
        // The new native module might not emit "onScannerLog" anymore, 
        // but let's keep it in case we add it back or for compatibility.
        // ZKFingerModule emits: onUsbPermissionGranted, onUsbPermissionDenied, onDeviceAttached, onDeviceDetached, onCaptureError, onImageReceived, onTemplateReceived
        return DeviceEventEmitter.addListener('onScannerLog', (event) => {
            if (event && event.log) {
                callback(event.log);
            }
        });
    }

    onScannerMessage(callback: (event: { message: string; type: 'info'|'success'|'error'|'warning' }) => void): EmitterSubscription {
        return DeviceEventEmitter.addListener('onScannerMessage', callback);
    }

    onImageReceived(callback: (base64: string) => void): EmitterSubscription {
        return DeviceEventEmitter.addListener('onImageReceived', callback);
    }

    onCaptureError(callback: (error: string) => void): EmitterSubscription {
        return DeviceEventEmitter.addListener('onCaptureError', callback);
    }

    onDeviceAttached(callback: () => void): EmitterSubscription {
        return DeviceEventEmitter.addListener('onDeviceAttached', callback);
    }

    onDeviceDetached(callback: () => void): EmitterSubscription {
        return DeviceEventEmitter.addListener('onDeviceDetached', callback);
    }

    onUsbPermissionGranted(callback: (msg: string) => void): EmitterSubscription {
        return DeviceEventEmitter.addListener('onUsbPermissionGranted', callback);
    }

    onUsbPermissionDenied(callback: (msg: string) => void): EmitterSubscription {
        return DeviceEventEmitter.addListener('onUsbPermissionDenied', callback);
    }

    // Get list of connected USB devices
    async getDevices(): Promise<UsbDevice[]> {
        if (!ExternalScanner) return [];
        try {
            return await ExternalScanner.getDeviceList();
        } catch (error) {
            console.error("Failed to get device list:", error);
            return [];
        }
    }

    async connect(deviceId?: number): Promise<boolean> {
        console.log(`ExternalScannerService: Connecting to ZKTeco device ${deviceId || 'auto-discovery'}...`);

        if (!ExternalScanner) {
            console.error("ExternalScanner native module is not available.");
            return false;
        }

        try {
            let targetDeviceId = deviceId;

            if (!targetDeviceId) {
                const devices = await ExternalScanner.getDeviceList();
                if (devices.length === 0) {
                    Alert.alert("No Device", "No USB fingerprint scanner found.");
                    return false;
                }
                const supportedDevice = devices[0]; // Simplified selection
                targetDeviceId = supportedDevice.deviceId;
            }

            this.currentDeviceId = targetDeviceId ?? null;

            // Request permission
            // The new native module returns a string: "Permission already granted" or "Requesting permission"
            const permissionResult = await ExternalScanner.requestPermission(targetDeviceId);
            console.log("Permission request result:", permissionResult);

            if (permissionResult === "Permission already granted") {
                this.isConnected = true;
                return true;
            } 
            
            // If "Requesting permission", we wait for the event 'onUsbPermissionGranted'
            // For now, we return true assuming user will grant it, 
            // or we could wait for the event here. 
            // The UI usually handles the async permission flow.
            return true; 

        } catch (error: any) {
            console.error('Connection failed:', error);
            Alert.alert("Connection Error", `Failed to connect: ${error.message}`);
            this.isConnected = false;
            return false;
        }
    }

    async getLogFilePath(): Promise<string> {
        return 'Log file not available in new module';
    }

    async disconnect(): Promise<void> {
        console.log('ExternalScannerService: Disconnecting...');
        if (ExternalScanner) {
            try {
                await ExternalScanner.stopScan();
            } catch (e) {
                console.warn("Disconnect error", e);
            }
        }
        this.isConnected = false;
        this.currentDeviceId = null;
    }

    // New methods for continuous scanning
    async startScan(): Promise<void> {
        if (!this.isConnected) {
            // Try to auto-connect/check permission if not explicitly connected
            // But usually we expect connect() to be called first.
        }
        return await ExternalScanner.startScan();
    }

    async stopScan(): Promise<void> {
        return await ExternalScanner.stopScan();
    }

    // Deprecated / Adapted for compatibility
    async captureFingerprint(): Promise<ScanResult> {
        // This used to be one-shot promise. 
        // Now it just starts the scan. 
        // We cannot return the image data here anymore.
        // Consumers MUST listen to onImageReceived.
        console.warn("captureFingerprint is deprecated. Use startScan() and onImageReceived event.");
        try {
            await this.startScan();
            return { success: true, data: undefined }; // Immediate return
        } catch (e: any) {
             return { success: false, error: e.message };
        }
    }
}

export const externalScanner = new ExternalScannerService();
