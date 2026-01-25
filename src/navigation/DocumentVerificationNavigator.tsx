import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import VerificationIdentifierScreen from '../screens/verification/VerificationIdentifier';
import VerificationDetailsScreen from '../screens/verification/VerificationDetails';
import VerificationDocumentsScreen from '../screens/verification/VerificationDocuments';

const Stack = createNativeStackNavigator();

export default function DocumentVerificationNavigator() {
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
                component={VerificationIdentifierScreen}
                options={{ title: 'Verification Identifier' }}
            />
            <Stack.Screen
                name="Details"
                component={VerificationDetailsScreen}
                options={{ title: 'Verify Details' }}
            />
            <Stack.Screen
                name="Documents"
                component={VerificationDocumentsScreen}
                options={{ title: 'Upload Documents' }}
            />
        </Stack.Navigator>
    );
}
