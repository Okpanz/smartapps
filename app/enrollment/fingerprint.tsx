import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Card } from '../../components/ui/Card';
import React from 'react';

export default function FingerprintScreen() {
    const router = useRouter();
    const { addFingerprint, fingerprints } = useEnrollmentStore();

    const currentCount = fingerprints.length;
    const isComplete = currentCount >= 3;

    const handleCapture = () => {
        if (isComplete) return;

        // Simulate capture delay
        setTimeout(() => {
            const mockData = `fp_data_${Date.now()}`;
            addFingerprint(mockData);

            if (currentCount + 1 === 3) {
                Alert.alert('Success', 'Fingerprint capture completed.');
            }
        }, 300);
    };

    const handleProceed = () => {
        router.push('/enrollment/face');
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator currentStep={3} totalSteps={5} />

            <View className="flex-1 p-6 items-center">
                <Text className="text-2xl font-bold text-primary mb-2 text-center">Fingerprint Capture</Text>
                <Text className="text-base text-gray-500 text-center mb-8">
                    Capture the employee's fingerprint 3 times to ensure accuracy.
                </Text>

                <Card className="w-full mb-8 py-6 px-4 bg-primary/5 border border-primary/20">
                    <Text className="text-sm font-medium text-gray-900 mb-2">Capture Progress</Text>
                    <ProgressBar progress={currentCount / 3} />
                    <Text className="text-xs text-gray-500 self-end mt-2 font-medium">{currentCount} / 3 Scans</Text>
                </Card>

                <TouchableOpacity
                    className={`
                        w-60 h-60 rounded-full bg-white border-2 border-dashed border-primary/40
                        justify-center items-center mb-10 shadow-sm
                        ${isComplete ? 'border-solid border-primary bg-primary/10' : ''}
                    `}
                    onPress={handleCapture}
                    disabled={isComplete}
                    activeOpacity={0.7}
                >
                    <View className={`
                        w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-4
                        ${isComplete ? 'bg-white' : ''}
                    `}>
                        {/* Use text emoji if vector icons fail to load or are missing */}
                        {isComplete ? (
                            <Text className="text-5xl">✅</Text>
                        ) : (
                            <Text className="text-5xl">🖐️</Text>
                        )}
                    </View>
                    <Text className={`
                        text-lg font-semibold text-primary
                        ${isComplete ? 'text-primary' : ''}
                    `}>
                        {isComplete ? 'Capture Complete' : 'Tap to Scan Finger'}
                    </Text>
                </TouchableOpacity>

                <View className="w-full mt-auto">
                    <Button
                        title="Proceed to Face Capture"
                        onPress={handleProceed}
                        disabled={!isComplete}
                        variant={isComplete ? 'filled' : 'tonal'}
                        className="w-full"
                    />
                </View>
            </View>
        </SafeAreaView>
    );
}

