import React from 'react';
import { View, Text, ScrollView, Animated, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import { useEffect, useRef } from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { isSmallDevice } from '../../utils/responsive';
import DatePicker from '../../components/ui/DatePicker';

export default function EmployeeDetailsScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    
    // Use shallow selector
    const employee = useEnrollmentStore((state) => state.employee);
    const dob = useEnrollmentStore((state) => state.dob);
    const firstAppointmentDate = useEnrollmentStore((state) => state.firstAppointmentDate);
    const nin = useEnrollmentStore((state) => state.nin);
    const setDob = useEnrollmentStore((state) => state.setDob);
    const setFirstAppointmentDate = useEnrollmentStore((state) => state.setFirstAppointmentDate);
    const setNin = useEnrollmentStore((state) => state.setNin);
    
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
            <EnhancedStepIndicator 
                currentStep={2} 
                totalSteps={6} 
                stepLabels={['Identify', 'Details', 'Upload', 'Prints', 'Face', 'Confirm']}
            />

            <Animated.ScrollView
                contentContainerStyle={{ padding: isSmallDevice ? 16 : 24, paddingBottom: 40 }}
                style={{ opacity: fadeAnim }}
            >
                {/* Header with Icon */}
                <View className="items-center mb-6">
                    <View className={`${isSmallDevice ? 'w-12 h-12' : 'w-16 h-16'} bg-primary/10 rounded-full items-center justify-center mb-4`}>
                        <Ionicons name="document-text-outline" size={isSmallDevice ? 24 : 32} color="#10B981" />
                    </View>
                    <Text className={`${isSmallDevice ? 'text-lg' : 'text-2xl'} font-bold text-primary mb-2 text-center`}>Confirm Details</Text>
                    <Text className={`${isSmallDevice ? 'text-xs' : 'text-base'} text-gray-500 text-center`}>
                        Please verify the employee information below before proceeding to biometric capture.
                    </Text>
                </View>

                <Card variant="outlined" className={isSmallDevice ? "p-4 mb-4 rounded-3xl bg-white border border-gray-100 shadow-sm" : "p-6 mb-6 rounded-3xl bg-white border border-gray-100 shadow-sm"}>
                    <DetailRow label="Full Name" value={employee.fullname || `${employee.firstName} ${employee.lastName}`} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Identifier" value={employee.identifier} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Account Number" value={employee.accountNumber} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DetailRow label="Department" value={employee.department} />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <View className="mb-4">
                        <Text className={`text-gray-500 mb-1 ${isSmallDevice ? 'text-xs' : 'text-sm'}`}>National Identification Number (NIN)</Text>
                        <TextInput
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-medium"
                            placeholder="Enter NIN"
                            value={nin || ''}
                            onChangeText={(text) => setNin(text.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                            maxLength={11}
                        />
                    </View>
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DatePicker
                        label="Date of Birth (YYYY-MM-DD)"
                        value={dob || ''}
                        onChange={(v) => setDob(v)}
                        minYear={1940}
                    />
                    <View className="h-[1px] bg-gray-100 my-4" />
                    <DatePicker
                        label="First Date of Appointment (YYYY-MM-DD)"
                        value={firstAppointmentDate || ''}
                        onChange={(v) => setFirstAppointmentDate(v)}
                        minYear={1940}
                    />
                </Card>

                <Button
                    title="Proceed to Document Upload"
                    onPress={() => navigation.navigate('Documents')}
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
            <Text className={`text-gray-500 mb-1 ${isSmallDevice ? 'text-xs' : 'text-sm'}`}>{label}</Text>
            <Text className={`font-semibold text-gray-900 ${isSmallDevice ? 'text-base' : 'text-lg'}`}>{value}</Text>
        </View>
        <Ionicons name="checkmark-circle" size={isSmallDevice ? 20 : 24} color="#10B981" />
    </View>
);
