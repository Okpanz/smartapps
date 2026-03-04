import { View, Text, Image, TouchableOpacity, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, useCameraFormat } from 'react-native-vision-camera';
import { useFaceDetector, Face } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useState, useRef, useEffect } from 'react';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import React from 'react';
import { CustomAlert, AlertType } from '../../components/ui/CustomAlert';
import { isSmallDevice } from '../../utils/responsive';

export default function FaceCaptureScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const resumeFlow = route.params?.resumeFlow === true;
    const { hasPermission, requestPermission } = useCameraPermission();
    const addImage = useEnrollmentStore((state) => state.addImage);
    const removeImage = useEnrollmentStore((state) => state.removeImage);
    const images = useEnrollmentStore((state) => state.images);
    const cameraRef = useRef<Camera>(null);
    const [facing, setFacing] = useState<'front' | 'back'>('front');
    const device = useCameraDevice(facing);
    const format = useCameraFormat(device, [
        { photoResolution: { width: 1280, height: 720 } }
    ]);


    const [preview, setPreview] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const lastTap = useRef(0);
    const [faces, setFaces] = useState<Face[]>([]);

    const { detectFaces } = useFaceDetector({
        performanceMode: 'fast',
        contourMode: 'none'
    });

    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: AlertType;
        confirmText?: string;
        onConfirm?: () => void;
    }>({
        visible: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showAlert = (
        title: string, 
        message: string, 
        type: AlertType = 'info', 
        onConfirm?: () => void,
        confirmText?: string
    ) => {
        setAlertConfig({ visible: true, title, message, type, onConfirm, confirmText });
    };

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    const handleFacesDetected = Worklets.createRunOnJS((detectedFaces: Face[]) => {
        setFaces(detectedFaces);
    });

    const frameProcessor = useFrameProcessor((frame) => {
        'worklet';
        const detectedFaces = detectFaces(frame);
        handleFacesDetected(detectedFaces);
    }, [handleFacesDetected, detectFaces]);

    const currentCount = images.length;
    const isComplete = currentCount >= 2;

    if (!hasPermission) {
        return (
            <View className="flex-1 bg-background items-center justify-center p-6">
                <Text className="text-lg text-gray-900 text-center mb-4">Camera access is required for enrollment.</Text>
                <Button onPress={requestPermission} title="Grant Permission" />
            </View>
        );
    }

    if (!device) {
        return <View className="flex-1 bg-background items-center justify-center"><Text>No camera device found</Text></View>;
    }

    const handleDoubleTap = () => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        if (lastTap.current && now - lastTap.current < DOUBLE_TAP_DELAY) {
            setFacing(current => (current === 'front' ? 'back' : 'front'));
        } else {
            lastTap.current = now;
        }
    };

    const takePicture = async () => {
        if (cameraRef.current && !isProcessing) {
            try {
                setIsProcessing(true);
                const photo = await cameraRef.current.takePhoto({
                    flash: 'off',
                });

                if (photo) {
                    setPreview(`file://${photo.path}`);
                }
            } catch (e) {
                showAlert('Error', 'Failed to take or process picture.', 'error');
                console.error(e);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const confirmPicture = () => {
        if (preview) {
            addImage(preview);
            setPreview(null);
        }
    };

    const retakePicture = () => {
        setPreview(null);
    };

    const handleProceed = () => {
        navigation.navigate('Save', { resumeFlow: resumeFlow });
    };

    // Determine indicator color and message based on face detection
    const isFaceDetected = faces.length > 0;
    const status = {
        color: isFaceDetected ? 'border-green-500' : 'border-white',
        // message: isFaceDetected ? 'Face Detected' : 'Position your face in the frame',
        bgColor: isFaceDetected ? 'bg-green-500' : 'bg-black/50',
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator 
                currentStep={resumeFlow ? 4 : 5} 
                totalSteps={resumeFlow ? 5 : 6} 
                stepLabels={resumeFlow ? ['Confirm', 'Documents', 'Prints', 'Face', 'Complete'] : ['Identify', 'Details', 'Upload', 'Prints', 'Face', 'Confirm']}
            />

            <View className={isSmallDevice ? "flex-1 p-3" : "flex-1 p-5"}>
                <Text className="text-2xl font-bold text-primary mb-1.5 text-center">Facial Capture</Text>
                <Text className="text-base text-gray-500 text-center mb-4">
                    {isComplete
                        ? "Capture complete. Please proceed."
                        : `Capture photo ${currentCount + 1} of 2`
                    }
                </Text>

                <View className="flex-1 rounded-3xl overflow-hidden bg-black mb-4 relative">
                    {isComplete ? (
                        <View className="flex-1 bg-background justify-center items-center">
                            <Text className="text-6xl"></Text>
                            <Text className="text-xl font-bold text-primary mt-4">All Photos Captured</Text>
                        </View>
                    ) : preview ? (
                        <View className="flex-1">
                            <Image source={{ uri: preview }} className="flex-1 bg-gray-800" />
                            <View className="absolute bottom-0 left-0 right-0 p-4 flex-row justify-between bg-black/50 gap-4">
                                <Button
                                    title="Retake"
                                    variant="outlined"
                                    onPress={retakePicture}
                                    className="flex-1 bg-transparent border-white"
                                    textClassName="text-white"
                                />
                                <Button
                                    title="Use Photo"
                                    variant="filled"
                                    onPress={confirmPicture}
                                    className="flex-1"
                                />
                            </View>
                        </View>
                    ) : (
                        <View className="flex-1">
                            <Camera
                                style={StyleSheet.absoluteFill}
                                ref={cameraRef}
                                device={device}
                                isActive={true}
                                photo={true}
                                format={format}
                                frameProcessor={frameProcessor}
                            />
                            <TouchableWithoutFeedback onPress={handleDoubleTap}>
                                <View className="flex-1 items-center">
                                    {/* Status Indicator at Top */}
                                    {/* <View className={`px-6 py-3 rounded-full ${status.bgColor} mt-4`}>
                                        <Text className="text-white font-semibold text-center">
                                            {status.message}
                                        </Text>
                                    </View> */}

                                    {/* Visual Guide circle with Dynamic Color */}
                                    <View
                                        className={`w-[280px] h-[280px] border-4 ${status.color} rounded-full border absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`}
                                    />

                                    {/* Capture Button - Always visible */}
                                    <View className="absolute bottom-5 left-0 right-0 items-center">
                                        <TouchableOpacity
                                            className={`w-[72px] h-[72px] rounded-full bg-white/30 items-center justify-center ${isProcessing ? 'opacity-50' : ''}`}
                                            onPress={takePicture}
                                            disabled={isProcessing}
                                        >
                                            <View className="w-[60px] h-[60px] rounded-full bg-white" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </View>
                    )}
                </View>

                {/* Thumbnails Row */}
                <View className="flex-row justify-center gap-4 mb-4 h-16">
                    {images.map((uri, idx) => (
                        <View key={idx} className="relative">
                            <Image source={{ uri }} className="w-[60px] h-[80px] rounded-lg border-2 border-primary" />
                            <TouchableOpacity
                                onPress={() => removeImage(uri)}
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 items-center justify-center"
                            >
                                <Text className="text-white text-xs">×</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                    {Array.from({ length: Math.max(0, 2 - images.length) }).map((_, idx) => (
                        <View key={`placeholder-${idx}`} className="w-[60px] h-[80px] rounded-lg border-2 border-dashed border-gray-300 bg-gray-100" />
                    ))}
                </View>

                <View className="mb-2">
                    <Button
                        title="Review & Submit"
                        onPress={handleProceed}
                        disabled={!isComplete}
                        variant={isComplete ? 'filled' : 'tonal'}
                    />
                </View>
                <View className="flex-row justify-between items-center mb-2">
                    <View className="flex-1 mr-2">
                        <Button
                            title="Back"
                            onPress={() => navigation.goBack()}
                            variant="text"
                            className="w-full"
                        />
                    </View>
                    <View className="flex-1 ml-2">
                        <Button
                            title="Skip Face Capture"
                            onPress={handleProceed}
                            variant="text"
                            className="w-full"
                        />
                    </View>
                </View>
            </View>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
                onConfirm={alertConfig.onConfirm}
                confirmText={alertConfig.confirmText}
            />
        </SafeAreaView>
    );
}
