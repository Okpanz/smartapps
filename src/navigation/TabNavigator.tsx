import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

import HomeScreen from '../screens/(tabs)/index';
import HistoryScreen from '../screens/(tabs)/history';
import AIScreen from '../screens/(tabs)/ai';
import SettingsScreen from '../screens/(tabs)/settings';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const Tab = createBottomTabNavigator();

const TabBarIcon = ({ name, color, focused, label }: { name: string; color: string; focused: boolean; label: string }) => (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2, width: '100%' }}>
        <View
            style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: focused ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
            }}
        >
            <Feather
                name={name as any}
                size={24}
                color={focused ? '#10B981' : '#94A3B8'}
            />
        </View>
        <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{
                fontSize: 10,
                fontWeight: '600',
                color: focused ? '#10B981' : '#94A3B8',
                opacity: focused ? 1 : 0.7,
                textAlign: 'center',
                width: '100%',
            }}
        >
            {label}
        </Text>
    </View>
);

export default function TabNavigator() {
    const { get, fetchForCurrentService } = useFeatureFlags();
    React.useEffect(() => { fetchForCurrentService(); }, []);
    const aiEnabled = get('ai_enabled', false);
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#ffffff',
                    height: 72,
                    borderTopWidth: 1,
                    borderTopColor: '#F1F5F9',
                    elevation: 10,
                    shadowColor: '#000',
                    shadowOffset: {
                        width: 0,
                        height: -4,
                    },
                    shadowOpacity: 0.05,
                    shadowRadius: 10,
                    paddingBottom: 0,
                    paddingTop: 0,
                    paddingHorizontal: 8,
                },
                tabBarShowLabel: false,
                tabBarActiveTintColor: '#10B981',
                tabBarInactiveTintColor: '#94A3B8',
            }}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{
                    tabBarIcon: (props) => <TabBarIcon {...props} name="home" label="Home" />,
                }}
            />
            <Tab.Screen
                name="History"
                component={HistoryScreen}
                options={{
                    tabBarIcon: (props) => <TabBarIcon {...props} name="clock" label="History" />,
                }}
            />
            {aiEnabled && (
                <Tab.Screen
                    name="AI"
                    component={AIScreen}
                    options={{
                        tabBarIcon: (props) => <TabBarIcon {...props} name="message-square" label="Chat" />,
                    }}
                />
            )}
            <Tab.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                    tabBarIcon: (props) => <TabBarIcon {...props} name="settings" label="Settings" />,
                }}
            />
        </Tab.Navigator>
    );
}
