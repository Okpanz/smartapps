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
import BackupRestoreScreen from './screens/BackupRestore';
import { NetworkIndicator } from './components/NetworkIndicator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useNetInfo } from '@react-native-community/netinfo';
import { syncPendingEnrollments } from './services/enrollment';
import { notificationService, subscribeNotifications } from './services/notification';
import { subscribeFeatureFlags } from './services/featureFlags';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import { useAuthStore } from './hooks/useAuthStore';

const Stack = createNativeStackNavigator();

export default function App() {
  const netInfo = useNetInfo();
  const wasOffline = React.useRef<boolean | null>(null);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadUserFromStorage = useAuthStore((s) => s.loadUserFromStorage);
  const fetchForCurrentService = useFeatureFlags((s) => s.fetchForCurrentService);

  React.useEffect(() => {
    loadUserFromStorage().catch((err) => {
      console.error('[App] Failed to load user from storage:', err);
    });
  }, []);

  React.useEffect(() => {
    fetchForCurrentService().catch(() => {});
  }, [user?.service_id]);

  React.useEffect(() => {
    const unsubscribe = subscribeFeatureFlags();
    return unsubscribe;
  }, [user?.service_id]);

  React.useEffect(() => {
    const unsubscribe = subscribeNotifications();
    return unsubscribe;
  }, [user?.service_id]);

  React.useEffect(() => {
    const isOffline =
      netInfo.isConnected === false ||
      (netInfo.isConnected === true && netInfo.isInternetReachable === false);
    const isOnline = netInfo.isConnected === true && netInfo.isInternetReachable === true;
    const isUnknown = netInfo.isConnected === true && netInfo.isInternetReachable === null;

    if (wasOffline.current === null) {
      if (!isUnknown) wasOffline.current = isOffline;
      return;
    }

    if (isOnline) {
      if (wasOffline.current) {
        notificationService.notifyInternetRestored();
        // Only sync when a valid authenticated session exists
        if (isAuthenticated) {
          syncPendingEnrollments();
        }
      }
      wasOffline.current = false;
    } else if (isOffline) {
      wasOffline.current = true;
    }
  }, [netInfo.isConnected, netInfo.isInternetReachable, isAuthenticated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <NetworkIndicator />
          <NavigationContainer>
            <StatusBar barStyle="dark-content" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Landing" component={LandingScreen} />
              <Stack.Screen name="Tabs" component={TabNavigator} />
              <Stack.Screen name="Enrollment" component={EnrollmentNavigator} />
              <Stack.Screen name="DocumentVerification" component={DocumentVerificationNavigator} />
              <Stack.Screen name="ResumeVerification" component={ResumeVerificationNavigator} />
              <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
