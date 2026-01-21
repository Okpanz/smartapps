import { View, Text, Image, TouchableOpacity, Alert, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useState, useRef } from 'react';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import React from 'react';

export default function FaceCaptureScreen() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const addImage = useEnrollmentStore((state) => state.addImage);
    const images = useEnrollmentStore((state) => state.images);
    const cameraRef = useRef<CameraView>(null);

    const [preview, setPreview] = useState<string | null>(null);
    const [facing, setFacing] = useState<'front' | 'back'>('front');
    const [isProcessing, setIsProcessing] = useState(false);
    const lastTap = useRef(0);

    const currentCount = images.length;
    const isComplete = currentCount >= 2;

    if (!permission) {
        return <View className="flex-1 bg-background" />;
    }

    if (!permission.granted) {
        return (
            <View className="flex-1 bg-background items-center justify-center p-6">
                <Text className="text-lg text-gray-900 text-center mb-4">Camera access is required for enrollment.</Text>
                <Button onPress={requestPermission} title="Grant Permission" />
            </View>
        );
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
                const photo = await cameraRef.current.takePictureAsync();

                if (photo) {
                    // Face detection is deprecated in Expo SDK 52+
                    // Skipping validation for now.
                    setPreview(photo.uri);
                }
            } catch (e) {
                Alert.alert('Error', 'Failed to take or process picture.');
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
        router.push('/enrollment/save');
    };

    // Determine indicator color and message
    // Static status since we removed live detection
    const status = {
        color: 'border-white',
        message: 'Position your face in the frame',
        bgColor: 'bg-black/50',
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator currentStep={4} totalSteps={5} />

            <View className="flex-1 p-6">
                <Text className="text-2xl font-bold text-primary mb-2 text-center">Facial Capture</Text>
                <Text className="text-base text-gray-500 text-center mb-6">
                    {isComplete
                        ? "Capture complete. Please proceed."
                        : `Capture photo ${currentCount + 1} of 2`
                    }
                </Text>

                <View className="flex-1 rounded-3xl overflow-hidden bg-black mb-6 relative">
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
                        <CameraView
                            style={{ flex: 1 }}
                            ref={cameraRef}
                            facing={facing}
                        >
                            <TouchableWithoutFeedback onPress={handleDoubleTap}>
                                <View className="flex-1 justify-between items-center py-6">
                                    {/* Status Indicator at Top */}
                                    <View className={`px-6 py-3 rounded-full ${status.bgColor} mt-4`}>
                                        <Text className="text-white font-semibold text-center">
                                            {status.message}
                                        </Text>
                                    </View>

                                    {/* Visual Guide Oval with Dynamic Color */}
                                    <View
                                        className={`w-[200px] h-[280px] border-4 ${status.color} rounded-[140px] border-dashed absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`}
                                        style={{
                                            transform: [
                                                { translateX: -100 },
                                                { translateY: -140 },
                                            ],
                                        }}
                                    />

                                    {/* Capture Button - Always visible */}
                                    <TouchableOpacity
                                        className={`w-[72px] h-[72px] rounded-full bg-white/30 items-center justify-center mb-5 ${isProcessing ? 'opacity-50' : ''}`}
                                        onPress={takePicture}
                                        disabled={isProcessing}
                                    >
                                        <View className="w-[60px] h-[60px] rounded-full bg-white" />
                                    </TouchableOpacity>
                                </View>
                            </TouchableWithoutFeedback>
                        </CameraView>
                    )}
                </View>

                {/* Thumbnails Row */}
                <View className="flex-row justify-center gap-4 mb-6 h-20">
                    {images.map((uri, idx) => (
                        <Image key={idx} source={{ uri }} className="w-[60px] h-[80px] rounded-lg border-2 border-primary" />
                    ))}
                    {Array.from({ length: Math.max(0, 2 - images.length) }).map((_, idx) => (
                        <View key={`placeholder-${idx}`} className="w-[60px] h-[80px] rounded-lg border-2 border-dashed border-gray-300 bg-gray-100" />
                    ))}
                </View>

                <Button
                    title="Review & Submit"
                    onPress={handleProceed}
                    disabled={!isComplete}
                    variant={isComplete ? 'filled' : 'tonal'}
                    className="mb-2"
                />
            </View>
        </SafeAreaView>
    );
}