import React, { useEffect, useRef } from 'react';
import { View, Text, SafeAreaView, Animated, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DatePicker from '../../components/ui/DatePicker';
import { isSmallDevice } from '../../utils/responsive';

export default function VerificationDetailsScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const resumeFlow = route.params?.resumeFlow === true;
    const stepLabels = resumeFlow ? ['Confirm', 'Documents', 'Prints', 'Face', 'Complete'] : ['Identify', 'Verify', 'Upload'];
    
    
    const employee = useEnrollmentStore((state) => state.employee);
    const dob = useEnrollmentStore((state) => state.dob);
    const firstAppointmentDate = useEnrollmentStore((state) => state.firstAppointmentDate);
    const nin = useEnrollmentStore((state) => state.nin);
    const bvn = useEnrollmentStore((state) => state.bvn);
    const setDob = useEnrollmentStore((state) => state.setDob);
    const setFirstAppointmentDate = useEnrollmentStore((state) => state.setFirstAppointmentDate);
    const setNin = useEnrollmentStore((state) => state.setNin);
    const setBvn = useEnrollmentStore((state) => state.setBvn);
    
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!employee) {
            const parent = navigation.getParent();
            if (parent) {
                parent.navigate('Enrollment', { screen: 'Identifier' });
            } else {
                navigation.navigate('Enrollment', { screen: 'Identifier' });
            }
        } else {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }).start();
        }
    }, [employee]);

    if (!employee) return null;

    const valDob = (dob || '').trim();
    const valFda = (firstAppointmentDate || '').trim();
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const canProceed = Boolean(valDob && valFda && re.test(valDob) && re.test(valFda));

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator currentStep={resumeFlow ? 1 : 2} totalSteps={resumeFlow ? 5 : 3} stepLabels={stepLabels} />

            <Animated.ScrollView
                contentContainerStyle={{ padding: isSmallDevice ? 16 : 24 }}
                style={{ opacity: fadeAnim }}
            >
                {/* Header with Icon */}
                <View className="items-center mb-6">
                    <View className={`${isSmallDevice ? 'w-12 h-12' : 'w-16 h-16'} bg-primary/10 rounded-full items-center justify-center mb-4`}>
                        <Ionicons name="document-text-outline" size={isSmallDevice ? 24 : 32} color="#10B981" />
                    </View>
                    <Text className={`${isSmallDevice ? 'text-xl' : 'text-2xl'} font-bold text-primary mb-2 text-center`}>Confirm Details</Text>
                    <Text className={`${isSmallDevice ? 'text-sm' : 'text-base'} text-gray-500 text-center`}>
                        Please verify the employee information below before uploading documents.
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
                    <View className="mb-4">
                        <Text className={`text-gray-500 mb-1 ${isSmallDevice ? 'text-xs' : 'text-sm'}`}>Bank Verification Number (BVN)</Text>
                        <TextInput
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-medium"
                            placeholder="Enter BVN"
                            value={bvn || ''}
                            onChangeText={(text) => setBvn(text.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                            maxLength={12}
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
                    onPress={() => navigation.navigate('Documents', { resumeFlow: true })}
                    variant={canProceed ? "filled" : "tonal"}
                    disabled={!canProceed}
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
