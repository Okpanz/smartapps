import { View, Text, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StepIndicator } from '../../components/ui/StepIndicator';
import { useEffect } from 'react';
import React from 'react';

export default function EmployeeDetailsScreen() {
    const router = useRouter();
    const employee = useEnrollmentStore((state) => state.employee);

    useEffect(() => {
        if (!employee) {
            router.replace('/enrollment/identifier');
        }
    }, [employee]);

    if (!employee) return null;

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="pt-6 bg-background">
                <StepIndicator currentStep={2} totalSteps={4} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 24 }}>
                <Text className="text-2xl font-bold text-primary mb-2">Confirm Details</Text>
                <Text className="text-base text-gray-500 mb-8">
                    Please verify the employee information below before proceeding to biometric capture.
                </Text>

                <Card variant="outlined" className="p-6 mb-6 rounded-3xl bg-white border border-gray-100">
                    <DetailRow label="Full Name" value={`${employee.firstName} ${employee.lastName}`} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Identifier" value={employee.identifier} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Account Number" value={employee.accountNumber} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Department" value={employee.department} />
                </Card>

                <Button
                    title="Proceed to Facial Capture"
                    onPress={() => router.push('/enrollment/face')}
                    variant="filled"
                    className="mt-4"
                />

                <Button
                    title="Back to Identifier"
                    onPress={() => router.back()}
                    variant="text"
                    className="mt-2"
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <View className="flex-col">
        <Text className="text-sm text-gray-500 mb-1">{label}</Text>
        <Text className="text-lg font-semibold text-gray-900">{value}</Text>
    </View>
);
