import { View, Text, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import { verifyIdentifier } from '../../services/verification';
import api from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { CustomAlert, AlertType } from '../../components/ui/CustomAlert';
import { resumeVerification } from '../../services/enrollment';

const identifierSchema = z.object({
    identifier: z.string()
        .min(3, 'Identifier must be at least 3 characters'),
});

type IdentifierForm = z.infer<typeof identifierSchema>;

import { isSmallDevice } from '../../utils/responsive';

export default function VerificationIdentifierScreen() {
    const navigation = useNavigation<any>();
    const stepLabels = ['Identify', 'Verify', 'Upload'];
    
    // Use shallow selector
    const setEmployee = useEnrollmentStore((state) => state.setEmployee);
    const resetEnrollment = useEnrollmentStore((state) => state.resetEnrollment);
    
    const [loading, setLoading] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: AlertType;
        onConfirm?: () => void;
        showCancel?: boolean;
        confirmText?: string;
        cancelText?: string;
        onCancel?: () => void;
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
        options?: {
            showCancel?: boolean;
            confirmText?: string;
            cancelText?: string;
            onCancel?: () => void;
        }
    ) => {
        setAlertConfig({
            visible: true,
            title,
            message,
            type,
            onConfirm,
            showCancel: options?.showCancel,
            confirmText: options?.confirmText,
            cancelText: options?.cancelText,
            onCancel: options?.onCancel,
        });
    };

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    const { control, handleSubmit, formState: { errors } } = useForm<IdentifierForm>({
        resolver: zodResolver(identifierSchema),
    });

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();
    }, []);

    const onSubmit = async (data: IdentifierForm) => {
        setLoading(true);
        resetEnrollment(); 
        
        try {
            // Check flags before verifying
            const { get, fetchForCurrentService } = useFeatureFlags.getState();
            await fetchForCurrentService();
            if (!get('new_verification_enabled', true) || !get('verification_general', true)) {
                showAlert(
                    'New Verification Disabled',
                    'New verification is disabled for your service. Please use Resume Verification instead.',
                    'warning',
                    () => navigation.navigate('ResumeVerification', { screen: 'Details', params: { resumeFlow: true } }),
                    { showCancel: true, confirmText: 'Go to Resume', cancelText: 'Cancel' }
                );
                return;
            }
            const employee = await verifyIdentifier(data.identifier);
            console.log('[VerificationIdentifier] Resolved employee from verifyIdentifier:', employee);
            setEmployee(employee);

            // Guard: if an existing verification/enrollment flow exists, prompt to use Resume instead
            try {
                const token = await AsyncStorage.getItem('userToken');
                const resumeEmployeeId = employee.id || employee.identifier;
                const res = await api.get('/mobile/v1/enrollments/resume', {
                    params: { employee_id: resumeEmployeeId },
                    headers: { Authorization: token ? `Bearer ${token}` : '' }
                });
                if (res.status === 200) {
                    showAlert(
                        'Existing Verification Found',
                        'A previous verification exists for this employee. Please use Resume Verification to continue.',
                        'warning',
                        () => {
                            (async () => {
                                try {
                                    await resumeVerification(resumeEmployeeId);
                                } catch {
                                } finally {
                                    navigation.navigate('ResumeVerification', { screen: 'Details', params: { resumeFlow: true } });
                                }
                            })();
                        },
                        {
                            showCancel: true,
                            confirmText: 'Go to Resume',
                            cancelText: 'Cancel',
                        }
                    );
                    return;
                }
            } catch (e: any) {
                // If 404, no existing flow; proceed. Any other error, proceed as new.
            }

            navigation.navigate('Details'); 
        } catch (error: any) {
            showAlert('Verification Failed', error.message || 'Invalid Identifier', 'error');
        } finally {
            setLoading(false);
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
                showCancel={alertConfig.showCancel}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onCancel={alertConfig.onCancel}
            />
            <EnhancedStepIndicator currentStep={1} totalSteps={3} stepLabels={stepLabels} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <Animated.ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: isSmallDevice ? 16 : 24, paddingBottom: 40 }}
                    style={{ opacity: fadeAnim }}
                >
                    {/* Header with Icon */}
                    <View className="items-center mb-6">
                        <View className="w-16 h-16 bg-primary/10 rounded-full items-center justify-center mb-4">
                            <Ionicons name="scan-outline" size={32} color="#10B981" />
                        </View>
                        <Text className="text-2xl font-bold text-primary mb-2 text-center">Document Verification</Text>
                        <Text className="text-base text-gray-500 text-center">
                            Enter the employee identifier to start the document upload process.
                        </Text>
                    </View>

                    <Card className="p-6">
                        <Input
                            label="Identifier / Account Number"
                            name="identifier"
                            control={control}
                            placeholder="e.g. EMP123 or John Doe"
                            keyboardType="default"
                            autoCapitalize="none"
                            error={errors.identifier?.message}
                            helperText="Enter Employee ID, Name, or Account Number"
                        />

                        <Button
                            title="Verify & Proceed"
                            onPress={handleSubmit(onSubmit)}
                            loading={loading}
                            className="mt-4"
                            variant="filled"
                        />
                    </Card>
                </Animated.ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
