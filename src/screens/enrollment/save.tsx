import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Image, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import { submitEnrollment } from '../../services/enrollment';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { CustomAlert, AlertType } from '../../components/ui/CustomAlert';
import { isSmallDevice } from '../../utils/responsive';

export default function SaveScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const flow = route.params?.flow || (route.params?.resumeFlow ? 'resume' : 'enroll');
    const { employee, images, fingerprints, skippedFingerprint, documents, resetEnrollment } = useEnrollmentStore();
    const [loading, setLoading] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    
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

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 50,
                friction: 7,
            }),
        ]).start();
    }, []);

    const handleSubmit = async () => {
        const isBiometricComplete = images.length >= 2 && (fingerprints.length >= 2 || skippedFingerprint);
        const isScanComplete = documents.length > 0;
        const enrollmentStatus = (images.length > 0 && documents.length > 0) ? 'VERIFIED' : 'UNVERIFIED';

        if (!employee) return;

        if (flow === 'scan' && !isScanComplete) {
            showAlert('Incomplete', 'Please upload at least one document or go back to enrollment.', 'warning');
            return;
        }

        if (flow === 'enroll' && !isBiometricComplete) {
            showAlert('Incomplete', 'Please complete all biometric steps before saving.', 'warning');
            return;
        }

        setLoading(true);
        try {
            await submitEnrollment({
                employeeId: employee.id,
                employeeInfo: employee,
                images,
                fingerprints,
                documents: documents.map(doc => ({ uri: doc.uri, type: doc.type })),
                status: enrollmentStatus,
            });

            showAlert(
                'Enrollment Successful',
                'The employee data has been verified and saved.',
                'success',
                () => {
                    resetEnrollment();
                    // Reset the root navigator (parent of EnrollmentNavigator) to Tabs
                    navigation.getParent()?.reset({
                        index: 0,
                        routes: [{ name: 'Tabs' }],
                    });
                },
                'Return to Dashboard'
            );
        } catch (error: any) {
            console.error('[SaveScreen] Submission Error:', error);
            showAlert('Error', `Submission failed: ${error.message || 'Unknown error'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!employee) return null;

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator 
                currentStep={flow === 'resume' ? 5 : 6} 
                totalSteps={flow === 'resume' ? 5 : 6} 
                stepLabels={flow === 'resume' ? ['Confirm', 'Documents', 'Prints', 'Face', 'Complete'] : ['Identify', 'Details', 'Upload', 'Prints', 'Face', 'Confirm']}
            />

            <Animated.ScrollView
                contentContainerStyle={{ padding: isSmallDevice ? 16 : 24, paddingBottom: 40 }}
                style={{ opacity: fadeAnim }}
            >
                {/* Header with Icon */}
                <Animated.View
                    className="items-center mb-6"
                    style={{ transform: [{ scale: scaleAnim }] }}
                >

                    <Text className="text-2xl font-bold text-primary mb-2 text-center">Final Review</Text>
                    <Text className="text-base text-gray-500 text-center">
                        Please review the enrollment summary before submitting.
                    </Text>
                </Animated.View>

                <Card className={isSmallDevice ? "mb-4 p-4 bg-white rounded-3xl" : "mb-4 p-6 bg-white rounded-3xl"}>
                    <View className="flex-row items-center mb-4">
                        <Ionicons name="person-circle-outline" size={24} color="#10B981" />
                        <Text className="text-lg font-semibold text-primary ml-2">Employee Information</Text>
                    </View>
                    <View className="flex-row justify-between mb-2 border-b border-gray-100 pb-1">
                        <Text className="text-sm text-gray-500">Name</Text>
                        <Text className="text-base font-semibold text-gray-900">{employee.firstName} {employee.lastName}</Text>
                    </View>
                    <View className="flex-row justify-between mb-2 border-b border-gray-100 pb-1">
                        <Text className="text-sm text-gray-500">Identifier</Text>
                        <Text className="text-base font-semibold text-gray-900">{employee.identifier}</Text>
                    </View>
                </Card>

                <Card variant="outlined" className={isSmallDevice ? "mb-4 p-4 rounded-3xl bg-white" : "mb-4 p-6 rounded-3xl bg-white"}>
                    <View className="flex-row items-center mb-4">
                        <Ionicons name="finger-print-outline" size={24} color="#10B981" />
                        <Text className="text-lg font-semibold text-primary ml-2">Fingerprints Captured</Text>
                    </View>

                    <View className="flex-row justify-between items-center bg-gray-50 p-4 rounded-2xl">
                        <Text className="text-gray-500 font-medium">Captured Scans</Text>
                        {skippedFingerprint ? (
                            <View className="flex-row items-center">
                                <Text className="text-lg font-bold text-orange-500 mr-2">Skipped</Text>
                                <Ionicons name="alert-circle-outline" size={20} color="#F97316" />
                            </View>
                        ) : (
                            <View className="flex-row items-center">
                                <Text className="text-lg font-bold text-primary mr-2">{fingerprints.length} / 2</Text>
                                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                            </View>
                        )}
                    </View>
                </Card>
                <Card variant="outlined" className={isSmallDevice ? "mb-4 p-4 rounded-3xl bg-white" : "mb-4 p-6 rounded-3xl bg-white"}>
                    <View className="flex-row items-center mb-4">
                        <Ionicons name="document-attach-outline" size={24} color="#10B981" />
                        <Text className="text-lg font-semibold text-primary ml-2">Documents Uploaded</Text>
                    </View>
                    <View className="bg-gray-50 p-4 rounded-2xl">
                        {documents.map((doc, idx) => (
                            <View key={doc.id} className="flex-row items-center justify-between mb-2 last:mb-0">
                                <Text className="text-sm font-medium text-gray-700">{doc.type.replace(/_/g, ' ')}</Text>
                                <Ionicons name="checkmark-done" size={18} color="#10B981" />
                            </View>
                        ))}
                    </View>
                </Card>

                <Card variant="outlined" className={isSmallDevice ? "mb-4 p-4 rounded-3xl bg-white" : "mb-4 p-6 rounded-3xl bg-white"}>
                    <View className="flex-row items-center mb-4">
                        <Ionicons name="camera-outline" size={24} color="#10B981" />
                        <Text className="text-lg font-semibold text-primary ml-2">Facial Photos Captured</Text>
                    </View>

                    <View className="items-center mb-6">
                        <Text className="text-sm text-gray-500 mb-1">Photos</Text>
                        <Text className="text-xl font-bold text-primary">{images.length} / 2</Text>
                    </View>

                    <View className="flex-row gap-3 justify-center">
                        {images.map((uri, idx) => (
                            <View key={idx} className="items-center">
                                <Image
                                    source={{ uri }}
                                    className="w-[80px] h-[100px] rounded-xl border-2 border-primary"
                                />
                                <View className="mt-2 bg-primary/10 px-3 py-1 rounded-full">
                                    <Text className="text-xs font-bold text-primary">Photo {idx + 1}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </Card>

                <Button
                    title="Back to Previous Step"
                    variant="outlined"
                    onPress={() => navigation.goBack()}
                    disabled={loading}
                    className="mb-2"
                />

                <Button
                    title="Submit Enrollment"
                    onPress={handleSubmit}
                    loading={loading}
                    variant="filled"
                    className="mt-6 mb-2"
                />

                <Button
                    title="Cancel"
                    variant="text"
                    onPress={() => navigation.replace('Tabs')}
                    disabled={loading}
                    className="mb-6"
                />
            </Animated.ScrollView>

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
