import { View, Text, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StepIndicator } from '../../components/ui/StepIndicator';
import { submitEnrollment } from '../../services/enrollment';

export default function SaveScreen() {
    const router = useRouter();
    const { employee, images, resetEnrollment } = useEnrollmentStore();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!employee || images.length < 2) {
            Alert.alert('Incomplete', 'Please complete all steps before saving.');
            return;
        }

        setLoading(true);
        try {
            await submitEnrollment({
                employeeId: employee.id,
                images,
            });

            // Success Logic could be a dedicated success screen, but alert is fine for now
            Alert.alert(
                'Enrollment Successful',
                'The employee data has been verified and saved.',
                [
                    {
                        text: 'Return to Dashboard',
                        onPress: () => {
                            resetEnrollment();
                            router.dismissAll();
                            router.replace('/dashboard');
                        }
                    }
                ]
            );
        } catch (error) {
            Alert.alert('Error', 'Submission failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!employee) return null;

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="pt-6 bg-background">
                <StepIndicator currentStep={4} totalSteps={4} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 24 }}>
                <Text className="text-2xl font-bold text-primary mb-2 text-center">Final Review</Text>
                <Text className="text-base text-gray-500 text-center mb-8">
                    Please review the enrollment summary before submitting.
                </Text>

                <Card className="mb-4 p-6 bg-white shadow-sm">
                    <Text className="text-lg font-semibold text-primary mb-4">Employee</Text>
                    <View className="flex-row justify-between mb-2 border-b border-gray-100 pb-1">
                        <Text className="text-sm text-gray-500">Name</Text>
                        <Text className="text-base font-semibold text-gray-900">{employee.firstName} {employee.lastName}</Text>
                    </View>
                    <View className="flex-row justify-between mb-2 border-b border-gray-100 pb-1">
                        <Text className="text-sm text-gray-500">Identifier</Text>
                        <Text className="text-base font-semibold text-gray-900">{employee.identifier}</Text>
                    </View>
                </Card>

                <Card variant="outlined" className="mb-4 p-6">
                    <Text className="text-lg font-semibold text-primary mb-4">Facial Photos Captured</Text>

                    <View className="items-center mb-6">
                        <Text className="text-sm text-gray-500 mb-1">Photos</Text>
                        <Text className="text-xl font-bold text-primary">{images.length} / 2</Text>
                    </View>

                    <View className="flex-row gap-2 justify-center">
                        {images.map((uri, idx) => (
                            <Image key={idx} source={{ uri }} className="w-[50px] h-[60px] rounded bg-gray-200" />
                        ))}
                    </View>
                </Card>

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
                    onPress={() => router.replace('/dashboard')}
                    disabled={loading}
                    className="mb-6"
                />
            </ScrollView>
        </SafeAreaView>
    );
}

