import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import IdentifierScreen from '../screens/enrollment/identifier';
import DetailsScreen from '../screens/enrollment/details';
import DocumentUploadScreen from '../screens/enrollment/documents';
import FingerprintScreen from '../screens/enrollment/fingerprint';
import FaceCaptureScreen from '../screens/enrollment/face';
import SaveEnrollmentScreen from '../screens/enrollment/save';

const Stack = createNativeStackNavigator();

export default function EnrollmentNavigator() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: {
                    backgroundColor: '#fff',
                },
                headerTintColor: '#000',
                contentStyle: {
                    backgroundColor: '#ffffff',
                },
            }}
        >
            <Stack.Screen
                name="Identifier"
                component={IdentifierScreen}
                options={{ title: 'Identifier' }}
            />
            <Stack.Screen
                name="Details"
                component={DetailsScreen}
                options={{ title: 'Employee Details' }}
            />
            <Stack.Screen
                name="Documents"
                component={DocumentUploadScreen}
                options={{ title: 'Document Upload' }}
            />
            <Stack.Screen
                name="Fingerprint"
                component={FingerprintScreen}
                options={{ title: 'Biometric Enrollment' }}
            />
            <Stack.Screen
                name="Face"
                component={FaceCaptureScreen}
                options={{ title: 'Facial Capture' }}
            />
            <Stack.Screen
                name="Save"
                component={SaveEnrollmentScreen}
                options={{ title: 'Confirm Enrollment', headerShown: false }}
            />
        </Stack.Navigator>
    );
}
