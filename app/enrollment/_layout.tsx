import React from 'react';
import { Stack } from 'expo-router';

export default function EnrollmentLayout() {
    return (
        <Stack
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
            <Stack.Screen name="identifier" options={{ title: 'Identifier', headerBackTitle: 'Dashboard' }} />
            <Stack.Screen name="details" options={{ title: 'Employee Details' }} />
            <Stack.Screen name="face" options={{ title: 'Facial Capture' }} />
            <Stack.Screen name="save" options={{ title: 'Confirm Enrollment', headerShown: false }} />
        </Stack>
    );
}
