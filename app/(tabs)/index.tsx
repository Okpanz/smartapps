import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import React from 'react';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { DUMMY_ACTIVITIES } from '../../constants/dummyData';

export default function DashboardScreen() {
    const router = useRouter();
    const { user, logout } = useAuthStore();

    const handleLogout = () => {
        logout();
        router.replace('/');
    };

    const stats = [
        { label: 'Total Enrolled', value: '1,284', change: '+12.5%' },
        { label: 'This Month', value: '86', change: '+8%' },
        { label: 'Pending', value: '3', change: '0%' },
    ];

    const recentActivities = DUMMY_ACTIVITIES.slice(0, 4);

    const quickActions = [
        {
            icon: <Ionicons name="person-add" size={24} color="#10B981" />,
            title: 'New Enrollment',
            description: 'Add employee',
            route: '/enrollment/identifier',
        },
        {
            icon: <MaterialIcons name="list-alt" size={24} color="#10B981" />,
            title: 'View Records',
            description: 'Browse all',
            route: '/records',
        },
        {
            icon: <MaterialIcons name="bar-chart" size={24} color="#10B981" />,
            title: 'Reports',
            description: 'View analytics',
            route: '/reports',
        },
        {
            icon: <Ionicons name="settings" size={24} color="#10B981" />,
            title: 'Settings',
            description: 'Configure app',
            route: '/settings',
        },
    ];

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View className="px-6 pt-6 pb-8 bg-white">
                    <View className="flex-row justify-between items-start mb-6">
                        <View className="flex-1">
                            <Text className="text-sm text-gray-500 font-medium mb-1">Welcome back 👋</Text>
                            <Text className="text-2xl font-bold text-gray-900">{user?.name || 'User'}</Text>
                        </View>

                    </View>

                    {/* Stats Cards */}
                    <View className="flex-row gap-3">
                        {stats.map((stat, index) => (
                            <View key={index} className="flex-1 bg-gray-50 rounded-2xl p-4 border border-gray-200">
                                <Text className="text-xs text-gray-500 font-medium mb-1">{stat.label}</Text>
                                <Text className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</Text>
                                <Text className={`text-xs font-semibold ${stat.change.startsWith('+') ? 'text-green-600' : 'text-gray-400'}`}>
                                    {stat.change}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Main Content */}
                <View className="px-6 py-6">
                    {/* Featured Action */}
                    <View className="mb-6">
                        <Text className="text-lg font-bold text-gray-900 mb-4">Start Enrollment</Text>
                        <TouchableOpacity
                            onPress={() => router.push('/enrollment/identifier')}
                            activeOpacity={0.9}
                            className="bg-green-600 rounded-3xl p-6"
                        >
                            <View className="flex-row items-center mb-4">
                                <View className="w-12 h-12 bg-green-100 rounded-2xl items-center justify-center mr-4">
                                    <Ionicons name="person-add" size={24} color="#059669" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-xl font-bold text-white mb-1">New Enrollment</Text>
                                    <Text className="text-sm text-green-100 font-medium">Ready to get started?</Text>
                                </View>
                            </View>
                            <Text className="text-sm text-green-50 mb-4 leading-5">
                                Complete identity verification and facial capture in minutes.
                            </Text>
                            <View className="flex-row items-center">
                                <Text className="text-sm font-bold text-white">Start Now</Text>
                                <Ionicons name="arrow-forward" size={16} color="#ffffff" className="ml-2" />
                            </View>
                        </TouchableOpacity>
                    </View>

                    {/* Quick Actions Grid */}
                    <View className="mb-6">
                        <Text className="text-lg font-bold text-gray-900 mb-4">Quick Actions</Text>
                        <View className="flex-row flex-wrap gap-3">
                            {quickActions.map((action, index) => (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => router.push(action.route)}
                                    activeOpacity={0.8}
                                    className="bg-white rounded-2xl p-4 border border-gray-200"
                                    style={{ width: '48%' }}
                                >
                                    <View className="w-12 h-12 bg-green-100 rounded-xl items-center justify-center mb-3">
                                        {action.icon}
                                    </View>
                                    <Text className="text-base font-bold text-gray-900 mb-1">{action.title}</Text>
                                    <Text className="text-xs text-gray-500 font-medium">{action.description}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Recent Activity */}
                    <View>
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-lg font-bold text-gray-900">Recent Activity</Text>
                            <TouchableOpacity onPress={() => router.push('/history')}>
                                <Text className="text-sm font-semibold text-green-600">See All</Text>
                            </TouchableOpacity>
                        </View>
                        <View className="gap-3">
                            {recentActivities.map((activity) => (
                                <View
                                    key={activity.id}
                                    className="flex-row items-center bg-white rounded-2xl p-4 border border-gray-100"
                                >
                                    <View className={`w-12 h-12 ${activity.bgIcon} rounded-full items-center justify-center mr-4`}>
                                        <Ionicons name={activity.icon} size={24} color={activity.iconColor} />
                                    </View>
                                    <View className="flex-1">
                                        <View className="flex-row justify-between items-center mb-0.5">
                                            <Text className="text-base font-bold text-gray-900">{activity.name}</Text>
                                            <Text className="text-xs text-gray-400 font-medium">{activity.time}</Text>
                                        </View>
                                        <View className="flex-row justify-between items-center">
                                            <Text className="text-sm text-gray-500 font-medium">{activity.type}</Text>
                                            <Text className={`text-xs font-bold ${activity.statusColor}`}>{activity.status}</Text>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
