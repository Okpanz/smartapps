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
import { NetworkIndicator } from './components/NetworkIndicator';
import { useNetInfo } from '@react-native-community/netinfo';
import { syncPendingEnrollments } from './services/enrollment';
import { notificationService } from './services/notification';
const Stack = createNativeStackNavigator();

export default function App() {
    console.log('[App] Rendering Root Component');
    const netInfo = useNetInfo();
    const wasOffline = React.useRef<boolean | null>(null);

    React.useEffect(() => {
        if (wasOffline.current === null && netInfo.isConnected !== null) {
            wasOffline.current = !netInfo.isConnected;
            return;
        }

        if (netInfo.isConnected === true) {
            console.log('[App] Network connected, attempting sync...');

            // Only notify if we were previously offline
            if (wasOffline.current) {
                notificationService.notifyInternetRestored();
            }

            syncPendingEnrollments();
            wasOffline.current = false;
        } else if (netInfo.isConnected === false) {
            wasOffline.current = true;
        }
    }, [netInfo.isConnected]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <NetworkIndicator />
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
