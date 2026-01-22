import React from 'react';
import { View, Text, ScrollView, SafeAreaView, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import { useEffect, useRef } from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function EmployeeDetailsScreen() {
    const navigation = useNavigation<any>();
    const employee = useEnrollmentStore((state) => state.employee);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!employee) {
            navigation.replace('Identifier');
        } else {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }).start();
        }
    }, [employee]);

    if (!employee) return null;

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator currentStep={2} totalSteps={5} />

            <Animated.ScrollView
                contentContainerStyle={{ padding: 24 }}
                style={{ opacity: fadeAnim }}
            >
                {/* Header with Icon */}
                <View className="items-center mb-6">
                    <View className="w-16 h-16 bg-primary/10 rounded-full items-center justify-center mb-4">
                        <Ionicons name="document-text-outline" size={32} color="#10B981" />
                    </View>
                    <Text className="text-2xl font-bold text-primary mb-2 text-center">Confirm Details</Text>
                    <Text className="text-base text-gray-500 text-center">
                        Please verify the employee information below before proceeding to biometric capture.
                    </Text>
                </View>

                <Card variant="outlined" className="p-6 mb-6 rounded-3xl bg-white border border-gray-100 shadow-sm">
                    <DetailRow label="Full Name" value={`${employee.firstName} ${employee.lastName}`} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Identifier" value={employee.identifier} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Account Number" value={employee.accountNumber} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Department" value={employee.department} />
                </Card>

                <Button
                    title="Proceed to Biometric Capture"
                    onPress={() => navigation.navigate('Fingerprint')}
                    variant="filled"
                    className="mt-4"
                />

                <Button
                    title="Back to Identifier"
                    onPress={() => navigation.goBack()}
                    variant="text"
                    className="mt-2"
                />
            </Animated.ScrollView>
        </SafeAreaView>
    );
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <View className="flex-row items-center justify-between">
        <View className="flex-1">
            <Text className="text-sm text-gray-500 mb-1">{label}</Text>
            <Text className="text-lg font-semibold text-gray-900">{value}</Text>
        </View>
        <Ionicons name="checkmark-circle" size={24} color="#10B981" />
    </View>
);
