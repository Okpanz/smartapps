import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

import HomeScreen from '../screens/(tabs)/index';
import HistoryScreen from '../screens/(tabs)/history';
import AIScreen from '../screens/(tabs)/ai';
import SettingsScreen from '../screens/(tabs)/settings';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const Tab = createBottomTabNavigator();

const ACTIVE_COLOR = '#10B981';
const INACTIVE_COLOR = '#94A3B8';

// ─── Exported so any screen can consume it ────────────────────────────────────
export const TAB_BAR_HEIGHT = 92;
export const TAB_BAR_BOTTOM_MARGIN = Platform.OS === 'ios' ? 24 : 16;

/** Total space the floating bar occupies at the bottom of the viewport */
export const useTabBarBottomInset = () => {
    const insets = useSafeAreaInsets();
    // bar height + its bottom offset + device safe-area (only counts once on iOS
    // because the bar itself sits above the home indicator)
    return TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + (Platform.OS === 'android' ? insets.bottom : 0);
};

const TabBarIcon = ({
    name,
    focused,
    label,
}: {
    name: string;
    focused: boolean;
    label: string;
}) => (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <View
            style={{
                width: 28,
                height: 3,
                borderRadius: 2,
                backgroundColor: focused ? ACTIVE_COLOR : 'transparent',
                marginBottom: 6,
            }}
        />
        <View
            style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? 'rgba(16, 185, 129, 0.10)' : 'transparent',
            }}
        >
            <Feather name={name as any} size={20} color={focused ? ACTIVE_COLOR : INACTIVE_COLOR} />
        </View>
        <Text
            numberOfLines={1}
            style={{
                fontSize: 10,
                fontWeight: '600',
                color: focused ? ACTIVE_COLOR : INACTIVE_COLOR,
                marginTop: 4,
                letterSpacing: 0.1,
            }}
        >
            {label}
        </Text>
    </View>
);

export default function TabNavigator() {
    const { get, fetchForCurrentService } = useFeatureFlags();
    const insets = useSafeAreaInsets();
    React.useEffect(() => { fetchForCurrentService(); }, []);
    const aiEnabled = get('ai_enabled', false);

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    position: 'absolute',
                    bottom: TAB_BAR_BOTTOM_MARGIN,
                    left: 16,
                    right: 16,
                    height: TAB_BAR_HEIGHT,
                    borderRadius: 24,
                    backgroundColor: '#ffffff',
                    borderTopWidth: 0,
                    elevation: 8,
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: 0.10,
                    shadowRadius: 12,
                    paddingBottom: 14,
                    paddingTop: 10,
                    paddingHorizontal: 12,
                },
               
                tabBarItemStyle: { overflow: 'visible' },
                tabBarShowLabel: false,
                tabBarActiveTintColor: ACTIVE_COLOR,
                tabBarInactiveTintColor: INACTIVE_COLOR,
                tabBarHideOnKeyboard: true,
            }}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{
                    tabBarIcon: ({ focused }) => (
                        <TabBarIcon focused={focused} name="home" label="Home" />
                    ),
                }}
            />
            <Tab.Screen
                name="History"
                component={HistoryScreen}
                options={{
                    tabBarIcon: ({ focused }) => (
                        <TabBarIcon focused={focused} name="clock" label="History" />
                    ),
                }}
            />
            {aiEnabled && (
                <Tab.Screen
                    name="AI"
                    component={AIScreen}
                    options={{
                        tabBarIcon: ({ focused }) => (
                            <TabBarIcon focused={focused} name="message-square" label="Chat" />
                        ),
                    }}
                />
            )}
            <Tab.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                    tabBarIcon: ({ focused }) => (
                        <TabBarIcon focused={focused} name="settings" label="Settings" />
                    ),
                }}
            />
        </Tab.Navigator>
    );
}