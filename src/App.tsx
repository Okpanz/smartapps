import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// @ts-ignore – CSS side-effect import for global styles
import './global.css';

import LandingScreen from './screens/index';
import TabNavigator from './navigation/TabNavigator';
import EnrollmentNavigator from './navigation/EnrollmentNavigator';
import DocumentVerificationNavigator from './navigation/DocumentVerificationNavigator';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <NavigationContainer>
                    <StatusBar barStyle="dark-content" />
                    <Stack.Navigator screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="Landing" component={LandingScreen} />
                        <Stack.Screen name="Tabs" component={TabNavigator} />
                        <Stack.Screen name="Enrollment" component={EnrollmentNavigator} />
                        <Stack.Screen name="DocumentVerification" component={DocumentVerificationNavigator} />
                    </Stack.Navigator>
                </NavigationContainer>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
