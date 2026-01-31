import { View, Text, KeyboardAvoidingView, Platform, Alert, Animated } from 'react-native';
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
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';

const identifierSchema = z.object({
    identifier: z.string()
        .min(3, 'Identifier must be at least 3 characters'),
});

type IdentifierForm = z.infer<typeof identifierSchema>;

export default function VerificationIdentifierScreen() {
    const navigation = useNavigation<any>();
    const stepLabels = ['Identify', 'Verify', 'Upload'];
    
    // Use shallow selector
    const setEmployee = useEnrollmentStore((state) => state.setEmployee);
    const resetEnrollment = useEnrollmentStore((state) => state.resetEnrollment);
    
    const [loading, setLoading] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;

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
            const employee = await verifyIdentifier(data.identifier);
            setEmployee(employee);
            navigation.navigate('Details'); 
        } catch (error: any) {
            Alert.alert('Verification Failed', error.message || 'Invalid Identifier');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator currentStep={1} totalSteps={3} stepLabels={stepLabels} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <Animated.ScrollView
                    contentContainerStyle={{ padding: 24 }}
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
