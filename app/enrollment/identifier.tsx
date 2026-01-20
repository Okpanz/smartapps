import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StepIndicator } from '../../components/ui/StepIndicator';
import { verifyIdentifier } from '../../services/verification';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';

const identifierSchema = z.object({
    identifier: z.string()
        .min(1, 'Identifier is required')
        .refine((val) => /^\d+$/.test(val), 'Must contain only numbers')
        .refine((val) => val.length >= 10, 'Must be at least 10 digits'),
});

type IdentifierForm = z.infer<typeof identifierSchema>;

export default function IdentifierScreen() {
    const router = useRouter();
    const setEmployee = useEnrollmentStore((state) => state.setEmployee);
    const resetEnrollment = useEnrollmentStore((state) => state.resetEnrollment);
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, formState: { errors } } = useForm<IdentifierForm>({
        resolver: zodResolver(identifierSchema),
    });

    const onSubmit = async (data: IdentifierForm) => {
        setLoading(true);
        resetEnrollment();

        try {
            const employee = await verifyIdentifier(data.identifier);
            setEmployee(employee);
            router.push('/enrollment/details');
        } catch (error: any) {
            Alert.alert('Verification Failed', error.message || 'Invalid Identifier');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="pt-6 bg-background">
                <StepIndicator currentStep={1} totalSteps={4} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ padding: 24 }}>
                    <Text className="text-2xl font-bold text-primary mb-2">Employee Identification</Text>
                    <Text className="text-base text-gray-500 mb-8">
                        Enter the unique identifier to verify the employee's eligibility for enrollment.
                    </Text>

                    <Card className="p-6">
                        <Input
                            label="Identifier / Account Number"
                            name="identifier"
                            control={control}
                            placeholder="e.g. 1234567890"
                            keyboardType="numeric"
                            error={errors.identifier?.message}
                            helperText="Enter the 10-digit BVN or ID"
                        />

                        <Button
                            title="Verify & Proceed"
                            onPress={handleSubmit(onSubmit)}
                            loading={loading}
                            className="mt-4"
                            variant="filled"
                        />
                    </Card>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
