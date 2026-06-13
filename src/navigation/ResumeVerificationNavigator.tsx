import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../constants/theme';
import VerificationDetailsScreen from '../screens/verification/VerificationDetails';
import DocumentUploadScreen from '../screens/enrollment/documents';
import FingerprintScreen from '../screens/enrollment/fingerprint';
import FaceCaptureScreen from '../screens/enrollment/face';
import SaveEnrollmentScreen from '../screens/enrollment/save';

const Stack = createNativeStackNavigator();

export default function ResumeVerificationNavigator() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: {
                    backgroundColor: COLORS.primary,
                },
                headerTintColor: COLORS.onPrimary,
                headerTitleStyle: {
                    color: COLORS.onPrimary,
                },
                contentStyle: {
                    backgroundColor: COLORS.background,
                },
            }}
        >
            <Stack.Screen
                name="Details"
                component={VerificationDetailsScreen}
                options={{ title: 'Confirm Details' }}
            />
            <Stack.Screen
                name="Documents"
                component={DocumentUploadScreen}
                options={{ title: 'Document Upload' }}
            />
            <Stack.Screen
                name="Fingerprint"
                component={FingerprintScreen}
                options={{ title: 'Fingerprints' }}
            />
            <Stack.Screen
                name="Face"
                component={FaceCaptureScreen}
                options={{ title: 'Face Capture' }}
            />
            <Stack.Screen
                name="Save"
                component={SaveEnrollmentScreen}
                options={{ title: 'Complete Verification', headerShown: false }}
            />
        </Stack.Navigator>
    );
}
