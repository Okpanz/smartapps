// Only log real errors, not anticipated retry cycles

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform, ActivityIndicator, Modal, FlatList, PermissionsAndroid, ScrollView, Share } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Card } from '../../components/ui/Card';
import { FingerprintImage } from '../../components/ui/FingerprintImage';
import { Toast, ToastType } from '../../components/ui/Toast';
import { CustomAlert, AlertType } from '../../components/ui/CustomAlert';
import { externalScanner, UsbDevice } from '../../services/externalScanner';

export default function FingerprintScreen() {
    // Local definition to avoid import issues and linter errors
    // type ScannerStatus = 'DISCONNECTED' | 'CONNECTING' | 'INITIALIZING' | 'CONNECTED' | 'SCANNING' | 'ERROR';

    const navigation = useNavigation<any>();
    const { addFingerprint, fingerprints } = useEnrollmentStore();

    const [scannerStatus, setScannerStatus] = useState<string>('DISCONNECTED');
    const [isInitializing, setIsInitializing] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [reviewState, setReviewState] = useState<{
        hasCapture: boolean;
        quality: number;
        data: string | null;
        preview: string | null;
    }>({ hasCapture: false, quality: 0, data: null, preview: null });

    // Device selection state
    const [devices, setDevices] = useState<UsbDevice[]>([]);
    const [showDeviceList, setShowDeviceList] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    // Logs state
    const [logs, setLogs] = useState<string[]>([]);
    const [lastCapturedBase64, setLastCapturedBase64] = useState<string | null>(null);
    const [toastState, setToastState] = useState<{ visible: boolean; message: string; type: ToastType }>({ 
        visible: false, 
        message: '', 
        type: 'info' 
    });
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: AlertType;
        onConfirm?: () => void;
    }>({
        visible: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showAlert = (title: string, message: string, type: AlertType = 'info', onConfirm?: () => void) => {
        setAlertConfig({ visible: true, title, message, type, onConfirm });
    };

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    const lastImageRef = useRef<string | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    const currentCount = fingerprints.length;
    const isComplete = currentCount >= 3;

    const [countdown, setCountdown] = useState<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const scanStatusRef = useRef<'idle' | 'waiting' | 'stabilizing' | 'captured'>('idle');

    // Update internal status ref whenever we change high-level state if needed, 
    // but better to manage local scan flow independently.

    useEffect(() => {
        // Subscribe to scanner logs
        const logSubscription = externalScanner.onLog((log) => {
            setLogs(prev => {
                const newLogs = [...prev, log];
                // Keep last 100 logs
                if (newLogs.length > 100) return newLogs.slice(newLogs.length - 100);
                return newLogs;
            });
        });

        const messageSubscription = externalScanner.onScannerMessage((event) => {
             setToastState({
                 visible: true,
                 message: event.message,
                 type: event.type
             });
        });

        // Image received listener
        const imageSubscription = externalScanner.onImageReceived((base64) => {
            const cleanBase64 = base64.replace(/\s/g, '');
            setLastCapturedBase64(cleanBase64);
            lastImageRef.current = cleanBase64;

            // Auto-stabilization logic
            if (scanStatusRef.current === 'waiting') {
                scanStatusRef.current = 'stabilizing';
                setCountdown(3);
                
                let count = 3;
                if (timerRef.current) clearInterval(timerRef.current);
                
                timerRef.current = setInterval(() => {
                    count--;
                    setCountdown(count);
                    if (count <= 0) {
                        // Use ref to get the latest image
                        stopScanning(true, lastImageRef.current || undefined);
                    }
                }, 1000);
            }
        });

        // Error listener
        // const errorSubscription = externalScanner.onCaptureError((err) => {
        //      console.log("Capture error:", err);
        // });

        // Initial check
        // setScannerStatus('DISCONNECTED');

        // Cleanup on unmount
        return () => {
            logSubscription.remove();
            messageSubscription.remove();
            imageSubscription.remove();
            // errorSubscription.remove();
            if (timerRef.current) clearInterval(timerRef.current);
            // We can't call stopScanning here effectively because it might use stale state/refs if not careful,
            // but the imperative stopScan is safe.
            externalScanner.stopScan().catch(console.warn);
        };
    }, []);

    // ... startScanning ... (needs to be redefined to be safe for closure usage if needed, but it's called from UI mostly)
    // Actually, startScanning and stopScanning are defined inside component, so they capture initial state if used in useEffect.
    // BUT we are calling stopScanning from setInterval which is created inside imageSubscription.
    // imageSubscription is created ONCE in useEffect([]).
    // So stopScanning is the ONE from initial render.
    // We need stopScanning to be stable or use refs for everything it touches.
    // stopScanning touches: externalScanner (stable), timerRef (stable), setCountdown (stable), setIsScanning (stable), scanStatusRef (stable), setReviewState (stable), Alert (stable).
    // It DOES NOT touch any other state except arguments.
    // So it is safe to use the initial render version of stopScanning!

    const startScanning = async () => {
        if (scanStatusRef.current === 'waiting' || scanStatusRef.current === 'stabilizing') return;
        
        try {
            console.log("Starting scan...");
            setIsScanning(true);
            setCountdown(null);
            scanStatusRef.current = 'waiting';
            lastImageRef.current = null;
            
            await externalScanner.startScan();
        } catch (err: any) {
            console.error("Start scan failed:", err);
            setIsScanning(false);
            scanStatusRef.current = 'idle';
            Alert.alert("Scan Error", "Failed to start scanning: " + err.message);
        }
    };

    const stopScanning = async (success: boolean, finalImage?: string) => {
        try {
            await externalScanner.stopScan();
        } catch (err) {
            console.warn("Stop scan error:", err);
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        setCountdown(null);
        setIsScanning(false);

        if (success && finalImage) {
            scanStatusRef.current = 'captured';
            setReviewState({
                hasCapture: true,
                quality: 100, // Assume good quality if stabilized
                data: finalImage,
                preview: null
            });
            Alert.alert('Success', 'Fingerprint captured successfully.');
        } else {
            scanStatusRef.current = 'idle';
        }
    };


    const handleConnectPress = async () => {
        console.log("FingerprintScreen: Searching for devices...");
        setIsSearching(true);
        try {
            const deviceList = await externalScanner.getDevices();
            console.log(`FingerprintScreen: Found ${deviceList.length} devices`);

            if (deviceList.length === 0) {
                Alert.alert("No Devices", "No USB scanners found. Please check your connection and ensure OTG is enabled.");
            } else if (deviceList.length === 1) {
                // Auto-connect if only one
                console.log(`FingerprintScreen: Auto-connecting to ${deviceList[0].deviceName}`);
                await connectToDevice(deviceList[0].deviceId);
            } else {
                // Show list
                setDevices(deviceList);
                setShowDeviceList(true);
            }
        } catch (error) {
            console.error("FingerprintScreen: Search error", error);
            Alert.alert("Error", "Failed to search for devices.");
        } finally {
            setIsSearching(false);
        }
    };

    const connectToDevice = async (deviceId: number) => {
        setShowDeviceList(false);
        setScannerStatus('CONNECTING');
        setIsInitializing(false);
        try {
            // First phase: connection
            const connected = await externalScanner.connect(deviceId);
            
            if (connected) {
                // Second phase: initialization
                setScannerStatus('INITIALIZING');
                setIsInitializing(true);
                
                // Wait a bit more to ensure scanner is fully ready
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Now mark as fully connected and ready
                setScannerStatus('CONNECTED');
                setIsInitializing(false);
                
                // Start scanning immediately
                startScanning();
                
                Alert.alert('Scanner Connected', 'External fingerprint scanner is ready.');
            } else {
                setScannerStatus('DISCONNECTED');
            }
        } catch (error) {
            setScannerStatus('ERROR');
            setIsInitializing(false);
            Alert.alert('Connection Failed', 'Could not connect to external scanner.');
        }
    };

    // Removed old retry loop logic
    /*
    const lastScanFailed = useRef(false);

    useEffect(() => {
        // ... old triggerAutoScan logic ...
    }, ...);
    */
    
    const confirmCapture = () => {
        if (reviewState.data) {
            addFingerprint(reviewState.data);
            setReviewState({ hasCapture: false, quality: 0, data: null, preview: null });

            if (currentCount + 1 >= 3) {
                showAlert('Success', 'Fingerprint capture completed.', 'success');
            } else {
                startScanning();
            }
        }
    };

    const retakeCapture = () => {
        setReviewState({ hasCapture: false, quality: 0, data: null, preview: null });
        startScanning();
    };

    const handleProceed = () => {
        navigation.navigate('Face');
    };

    const handleCopyLogs = async () => {
        if (logs.length === 0) {
            Alert.alert('No Logs', 'There are no logs to copy.');
            return;
        }
        try {
            await Share.share({
                message: logs.join('\n'),
                title: 'Scanner Debug Logs'
            });
        } catch (error) {
            console.error('Error sharing logs:', error);
            Alert.alert('Error', 'Failed to share logs');
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <CustomAlert 
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
                onConfirm={alertConfig.onConfirm}
            />
            <Toast 
                visible={toastState.visible}
                message={toastState.message}
                type={toastState.type}
                onHide={() => setToastState(prev => ({ ...prev, visible: false }))}
            />
            <EnhancedStepIndicator currentStep={4} totalSteps={6} />

            <View className="flex-1 p-6 items-center">
                <Text className="text-2xl font-bold text-primary mb-2 text-center">Fingerprint Capture</Text>
                <Text className="text-base text-gray-500 text-center mb-6">
                    Use the external scanner to capture 3 fingerprints.
                </Text>

                {/* Scanner Status Indicator */}
                <View className="flex-row items-center mb-8 bg-gray-100 px-4 py-2 rounded-full">
                    <View className={`w-3 h-3 rounded-full mr-2 ${
                        scannerStatus === 'CONNECTED' ? 'bg-green-500' :
                        scannerStatus === 'INITIALIZING' ? 'bg-yellow-500' :
                        scannerStatus === 'CONNECTING' ? 'bg-yellow-500' : 
                        'bg-red-500'
                    }`} />
                    <Text className="text-sm font-medium text-gray-700">
                        Scanner: {
                            scannerStatus === 'CONNECTED' ? 'Ready' :
                            scannerStatus === 'INITIALIZING' ? 'Initializing...' :
                            scannerStatus === 'CONNECTING' ? 'Connecting...' : 
                            'Disconnected'
                        }
                    </Text>
                </View>

                <Card className="w-full mb-8 py-6 px-4 bg-primary/5 border border-primary/20">
                    <Text className="text-sm font-medium text-gray-900 mb-2">Capture Progress</Text>
                    <ProgressBar progress={currentCount / 3} />
                    <Text className="text-xs text-gray-500 self-end mt-2 font-medium">{currentCount} / 3 Scans</Text>
                </Card>

                {scannerStatus !== 'CONNECTED' && scannerStatus !== 'INITIALIZING' ? (
                    <TouchableOpacity
                        className="w-60 h-60 rounded-full bg-white border-2 border-dashed border-gray-300 justify-center items-center mb-10 shadow-sm"
                        onPress={handleConnectPress}
                        disabled={scannerStatus === 'CONNECTING' || scannerStatus === 'INITIALIZING' || isSearching}
                    >
                        {scannerStatus === 'CONNECTING' || scannerStatus === 'INITIALIZING' || isSearching ? (
                            <View className="items-center">
                                <ActivityIndicator size="large" color="#007AFF" />
                                <Text className="text-gray-400 mt-2 text-xs">
                                    {isSearching ? "Searching..." : 
                                     scannerStatus === 'INITIALIZING' ? "Initializing..." : 
                                     "Connecting..."}
                                </Text>
                            </View>
                        ) : (
                            <>
                                <Ionicons name="bluetooth-outline" size={60} color="#9CA3AF" />
                                <Text className="text-gray-500 mt-4 font-medium">Connect Scanner</Text>
                            </>
                        )}
                    </TouchableOpacity>
                ) : reviewState.hasCapture ? (
                    <View className="w-full items-center mb-10">
                        <FingerprintImage
                            base64Data={lastCapturedBase64}
                            width={240}
                            height={240}
                            quality={reviewState.quality}
                            showQuality={true}
                        />

                        <View className="flex-row w-full justify-between px-4 mt-6">
                            <Button
                                title="Retake"
                                onPress={retakeCapture}
                                variant="outlined"
                                className="flex-1 mr-2"
                            />
                            <Button
                                title="Confirm"
                                onPress={confirmCapture}
                                variant="filled"
                                className="flex-1 ml-2"
                                disabled={reviewState.quality < 60} // Enforce minimum quality
                            />
                        </View>
                        {reviewState.quality < 60 && (
                            <Text className="text-red-500 text-sm mt-2 font-medium">Quality too low. Please retake.</Text>
                        )}
                    </View>
                ) : (
                    isComplete ? (
                        <View className="w-60 h-60 rounded-full bg-primary/10 border-2 border-solid border-primary justify-center items-center shadow-sm mb-10">
                            <Ionicons name="checkmark-circle" size={80} color="#007AFF" />
                            <Text className="text-primary mt-4 font-semibold text-lg">Capture Complete</Text>
                        </View>
                    ) : (
                        <View className="w-60 h-60 rounded-2xl bg-white border-2 border-solid border-primary/60 justify-center items-center shadow-lg relative overflow-hidden mb-10">
                            {lastCapturedBase64 ? (
                                <>
                                    <FingerprintImage
                                        base64Data={lastCapturedBase64}
                                        width={240}
                                        height={240}
                                    />
                                    {isScanning && (
                                        <View className="absolute inset-0 justify-center items-center bg-black/20">
                                            {countdown !== null ? (
                                                <>
                                                    <Text className="text-white font-bold text-5xl mb-2">{countdown}</Text>
                                                    <Text className="text-white font-bold text-sm">Stabilizing...</Text>
                                                </>
                                            ) : (
                                                <>
                                                    <ActivityIndicator size="large" color="#007AFF" />
                                                    <Text className="text-white font-bold text-sm mt-2">Scanning...</Text>
                                                </>
                                            )}
                                        </View>
                                    )}
                                    {!isScanning && (
                                        <View className="absolute bottom-0 w-full bg-primary/80 py-2 items-center">
                                            <Text className="text-white text-xs font-medium">Last Capture - Place Finger Again</Text>
                                        </View>
                                    )}
                                </>
                            ) : (
                                <>
                                    {isInitializing ? (
                                        <>
                                            <ActivityIndicator size="large" color="#007AFF" className="mb-4" />
                                            <Text className="text-primary font-bold text-xl">Initializing...</Text>
                                            <Text className="text-gray-400 text-xs mt-1">Please wait</Text>
                                        </>
                                    ) : (
                                        <>
                                            <ActivityIndicator size="large" color="#007AFF" className="mb-4" />
                                            <Text className="text-primary font-bold text-xl">Ready</Text>
                                            <Text className="text-gray-400 text-xs mt-1">Place Finger on Scanner</Text>
                                        </>
                                    )}
                                </>
                            )}
                            <View className="absolute w-full h-full border-4 border-primary/10 rounded-2xl pointer-events-none" />
                        </View>
                    )
                )}

                <View className="w-full mt-4">
                    <Button
                        title="Proceed to Face Capture"
                        onPress={handleProceed}
                        disabled={!isComplete}
                        variant={isComplete ? 'filled' : 'tonal'}
                        className="w-full"
                    />
                </View>

             
                {/* Device Selection Modal */}
                <Modal
                    visible={showDeviceList}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowDeviceList(false)}
                >
                    <View className="flex-1 bg-black/50 justify-center items-center p-4">
                        <View className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
                            <Text className="text-xl font-bold text-gray-900 mb-4">Select USB Scanner</Text>

                            {devices.length > 0 ? (
                                <FlatList
                                    data={devices}
                                    keyExtractor={(item) => item.deviceId.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            className="flex-row items-center p-4 border-b border-gray-100 active:bg-gray-50"
                                            onPress={() => connectToDevice(item.deviceId)}
                                        >
                                            <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center mr-3">
                                                <Ionicons name="usb-outline" size={20} color="#007AFF" />
                                            </View>
                                            <View className="flex-1">
                                                <Text className="font-medium text-gray-900">{item.product || item.deviceName}</Text>
                                                <Text className="text-xs text-gray-500">{item.manufacturer || `Vendor: ${item.vendorId}`}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                                        </TouchableOpacity>
                                    )}
                                    className="max-h-60"
                                />
                            ) : (
                                <Text className="text-gray-500 text-center py-4">No devices found</Text>
                            )}

                            <Button
                                title="Cancel"
                                onPress={() => setShowDeviceList(false)}
                                variant="text"
                                className="mt-4"
                            />
                        </View>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}