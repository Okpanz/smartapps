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
import ResumeVerificationNavigator from './navigation/ResumeVerificationNavigator';
import { NetworkIndicator } from './components/NetworkIndicator';
import { useNetInfo } from '@react-native-community/netinfo';
import { syncPendingEnrollments } from './services/enrollment';
import { notificationService, subscribeNotifications } from './services/notification';
import { subscribeFeatureFlags } from './services/featureFlags';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import { useAuthStore } from './hooks/useAuthStore';
const Stack = createNativeStackNavigator();

export default function App() {
    console.log('[App] Rendering Root Component');
    const netInfo = useNetInfo();
    const wasOffline = React.useRef<boolean | null>(null);
    const user = useAuthStore((s) => s.user);
    const loadUserFromStorage = useAuthStore((s) => s.loadUserFromStorage);
    const fetchForCurrentService = useFeatureFlags((s) => s.fetchForCurrentService);

    // Initialize auth state on app mount
    React.useEffect(() => {
        console.log('[App] Initializing auth state...');
        loadUserFromStorage().catch((err) => {
            console.error('[App] Failed to load user from storage:', err);
        });
    }, []);

    React.useEffect(() => {
        fetchForCurrentService().catch(() => {});
    }, [user?.service_id]);

    React.useEffect(() => {
        let unsubscribe = subscribeFeatureFlags();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [user?.service_id]);

    React.useEffect(() => {
        let unsubscribe = subscribeNotifications();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [user?.service_id]);

    React.useEffect(() => {
        // Calculate current state based on both properties
        // Offline = Disconnected OR (Connected but not reachable)
        const isOffline = netInfo.isConnected === false || (netInfo.isConnected === true && netInfo.isInternetReachable === false);
        // Online = Connected AND Reachable
        const isOnline = netInfo.isConnected === true && netInfo.isInternetReachable === true;
        // Unknown = Connected but reachability is null (pending)
        const isUnknown = netInfo.isConnected === true && netInfo.isInternetReachable === null;

        // Initialize state
        if (wasOffline.current === null) {
            if (!isUnknown) {
                wasOffline.current = isOffline;
            }
            return;
        }

        if (isOnline) {
            // Only notify/sync if we were previously offline
            if (wasOffline.current) {
                console.log('[App] Network connected (reachable), attempting sync...');
                notificationService.notifyInternetRestored();
                syncPendingEnrollments();
            }
            wasOffline.current = false;
        } else if (isOffline) {
            wasOffline.current = true;
        }
    }, [netInfo.isConnected, netInfo.isInternetReachable]);

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
                        <Stack.Screen name="ResumeVerification" component={ResumeVerificationNavigator} />
                    </Stack.Navigator>
                </NavigationContainer>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
