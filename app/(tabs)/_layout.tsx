import { Tabs } from 'expo-router';
import { View, Text, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import React from 'react';

export default function TabLayout() {
    return (
        <Tabs
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
                tabBarItemStyle: {
                    height: 72,
                    justifyContent: 'center',
                    alignItems: 'center',
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    tabBarIcon: ({ color, focused }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 72 }}>
                            {focused && (
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        width: 40,
                                        height: 4,
                                        backgroundColor: '#10B981',
                                        borderRadius: 999,
                                    }}
                                />
                            )}
                            <View
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 56,
                                    height: 56,
                                    borderRadius: 16,
                                    backgroundColor: focused ? '#07560bff' : 'transparent',
                                    transform: focused ? [{ scale: 1.08 }] : [{ scale: 1 }],
                                }}
                            >
                                <Feather
                                    name="home"
                                    size={26}
                                    color={color}
                                    strokeWidth={focused ? 2.5 : 2}
                                />
                            </View>
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color: focused ? '#10B981' : 'transparent',
                                    marginTop: 2,
                                    height: 14,
                                }}
                            >
                                Home
                            </Text>
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="history"
                options={{
                    tabBarIcon: ({ color, focused }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 72 }}>
                            {focused && (
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        width: 40,
                                        height: 4,
                                        backgroundColor: '#10B981',
                                        borderRadius: 999,
                                    }}
                                />
                            )}
                            <View
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 56,
                                    height: 56,
                                    borderRadius: 16,
                                    backgroundColor: focused ? '#07560bff' : 'transparent',
                                    transform: focused ? [{ scale: 1.08 }] : [{ scale: 1 }],
                                }}
                            >
                                <Feather
                                    name="clock"
                                    size={26}
                                    color={color}
                                    strokeWidth={focused ? 2.5 : 2}
                                />
                            </View>
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color: focused ? '#10B981' : 'transparent',
                                    marginTop: 2,
                                    height: 14,
                                }}
                            >
                                History
                            </Text>
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="ai"
                options={{
                    tabBarIcon: ({ color, focused }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 72 }}>
                            {focused && (
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        width: 40,
                                        height: 4,
                                        backgroundColor: '#10B981',
                                        borderRadius: 999,
                                    }}
                                />
                            )}
                            <View
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 56,
                                    height: 56,
                                    borderRadius: 16,
                                    backgroundColor: focused ? '#07560bff' : 'transparent',
                                    transform: focused ? [{ scale: 1.08 }] : [{ scale: 1 }],
                                }}
                            >
                                <Feather
                                    name="message-square"
                                    size={26}
                                    color={color}
                                    strokeWidth={focused ? 2.5 : 2}
                                />
                            </View>
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color: focused ? '#10B981' : 'transparent',
                                    marginTop: 2,
                                    height: 14,
                                }}
                            >
                                Chat
                            </Text>
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    tabBarIcon: ({ color, focused }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 72 }}>
                            {focused && (
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        width: 40,
                                        height: 4,
                                        backgroundColor: '#10B981',
                                        borderRadius: 999,
                                    }}
                                />
                            )}
                            <View
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 56,
                                    height: 56,
                                    borderRadius: 16,
                                    backgroundColor: focused ? '#07560bff' : 'transparent',
                                    transform: focused ? [{ scale: 1.08 }] : [{ scale: 1 }],
                                }}
                            >
                                <Feather
                                    name="settings"
                                    size={26}
                                    color={color}
                                    strokeWidth={focused ? 2.5 : 2}
                                />
                            </View>
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color: focused ? '#10B981' : 'transparent',
                                    marginTop: 2,
                                    height: 14,
                                }}
                            >
                                Settings
                            </Text>
                        </View>
                    ),
                }}
            />
        </Tabs>
    );
}