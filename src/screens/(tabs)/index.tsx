import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { DUMMY_ACTIVITIES } from '../../constants/dummyData';
import { getRecentActivity, AuditLog } from '../../services/activity';
import { getDashboardStats } from '../../services/dashboard';
import { formatDistanceToNow } from 'date-fns';
import { downloadOfflineRecords } from '../../services/auth';
import { checkPendingEnrollments, syncPendingEnrollments } from '../../services/enrollment';

import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { isSmallDevice } from '../../utils/responsive';

export default function DashboardScreen() {
    const navigation = useNavigation<any>();
    const { 
        user, 
        logout, 
        syncStatus, 
        setSyncStatus, 
        setLastSyncTime,
        pendingUploadsCount,
        uploadStatus 
    } = useAuthStore();
    // const setFlowType = useEnrollmentStore((state) => state.setFlowType);
    
    const [recentActivities, setRecentActivities] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<any[]>([
        { label: 'Total Verified', value: '...', change: '...' },
        { label: 'Verified', value: '...', change: '...' },
        { label: 'Pending', value: '...', change: '...' },
        { label: 'This Month', value: '...', change: '...' },
    ]);

    useEffect(() => {
        // Check for pending enrollments on mount
        checkPendingEnrollments();
    }, []);

    useEffect(() => {
        const performAutoSync = async () => {
            // 1. Download Offline Records (if needed)
            if (user?.service_id && syncStatus === 'idle') {
                try {
                    setSyncStatus('syncing');
                    console.log('[Dashboard] Starting automatic sync (download)...');
                    await downloadOfflineRecords(undefined, user.service_id);
                    setSyncStatus('success');
                    setLastSyncTime(new Date());
                    console.log('[Dashboard] Automatic download sync completed');
                } catch (error) {
                    console.error('[Dashboard] Automatic download sync failed', error);
                    setSyncStatus('error');
                }
            }

            // 2. Upload Pending Enrollments (if any)
            if (pendingUploadsCount > 0 && uploadStatus === 'idle') {
                console.log('[Dashboard] Triggering auto-sync for pending uploads...');
                syncPendingEnrollments();
            }
        };

        performAutoSync();
    }, [user, syncStatus, pendingUploadsCount, uploadStatus]);

    const fetchStats = async () => {
        try {
            const data = await getDashboardStats();
            setStats([
                { label: 'Total Verified', value: data.total.value, change: data.total.change },
                { label: 'Verified', value: data.verified.value, change: data.verified.change },
                { label: 'Pending', value: data.pending.value, change: data.pending.change },
                { label: 'This Month', value: data.thisMonth.value, change: data.thisMonth.change },
            ]);
        } catch (error) {
            console.error('Failed to load stats', error);
        }
    };

    const fetchActivities = async () => {
        try {
            const logs = await getRecentActivity(5);

            const mappedActivities = logs.map(log => {
                let icon = 'ellipse';
                let bgIcon = 'bg-gray-100';
                let iconColor = '#6B7280';
                let statusColor = 'text-gray-500';
                let name = 'System Activity';
                let type = log.action;

                // Map content based on action
                if (log.action.includes('ENROLLMENT')) {
                    icon = 'person-add';
                    bgIcon = 'bg-blue-100';
                    iconColor = '#3B82F6';
                    name = log.details?.employeeName || 'New Verification';
                    type = 'Employee Verification';
                } else if (log.action.includes('VERIFICATION')) {
                    icon = 'checkmark-circle';
                    bgIcon = 'bg-green-100';
                    iconColor = '#10B981';
                    name = log.details?.employeeName || 'Verification';
                    type = 'Identity Verified';
                }

                return {
                    id: log._id,
                    name: name,
                    type: type,
                    time: formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }),
                    status: 'Completed',
                    statusColor: 'text-green-600',
                    icon,
                    bgIcon,
                    iconColor
                };
            });
            setRecentActivities(mappedActivities);
        } catch (error) {
            console.error('Failed to load activities', error);
            // Fallback to dummy if fetch fails? Or just empty.
            // setRecentActivities(DUMMY_ACTIVITIES.slice(0, 4));
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchActivities();
            fetchStats();
        }, [])
    );

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchActivities(), fetchStats()]);
        setRefreshing(false);
    }, []);

    const handleLogout = () => {
        logout();
        navigation.replace('Landing');
    };

    // Stats are now state-based - fixed duplicate declaration issue
    // const stats = [ ... ] // Removed static declaration

    // Quick Actions
    const quickActions = [
        {
            icon: <Ionicons name="scan-outline" size={24} color="#10B981" />,
            title: 'Scan Document',
            description: 'Verify & Scan',
            route: 'DocumentVerification',
        },
        {
            icon: <Ionicons name="settings" size={24} color="#10B981" />,
            title: 'Settings',
            description: 'Configure app',
            route: 'Settings',
        },
        {
            icon: <Ionicons name="time" size={24} color="#10B981" />,
            title: 'Activity',
            description: 'View history',
            route: 'History',
        },
        {
            icon: <Ionicons name="chatbubbles" size={24} color="#10B981" />,
            title: 'AI Assistant',
            description: 'Get help',
            route: 'AI',
        },


    ];

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView 
                className="flex-1" 
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {/* Header */}
                <View className="px-6 pt-6 pb-8 bg-white">
                    <View className="flex-row justify-between items-start mb-6">
                        <View className="flex-1">
                            <Text className="text-sm text-gray-500 font-medium mb-1">Welcome back 👋</Text>
                            <Text className="text-2xl font-bold text-gray-900">{user?.name || 'User'}</Text>
                        </View>

                    </View>

                {/* Stats Cards */}
                <View className="flex-row flex-wrap gap-2">
                    {stats.map((stat, index) => (
                        <View
                            key={index}
                            className="bg-gray-50 rounded-xl p-3 border border-gray-200"
                            style={{ width: isSmallDevice ? '48%' : '31%' }}
                        >
                            <Text className="text-[10px] text-gray-500 font-medium mb-1" numberOfLines={1}>{stat.label}</Text>
                            <Text className="text-lg font-bold text-gray-900 mb-1">{stat.value}</Text>
                            <Text className={`text-[10px] font-semibold ${stat.change.startsWith('+') ? 'text-green-600' : 'text-gray-400'}`}>
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
                        <Text className="text-lg font-bold text-gray-900 mb-4">Start Verification</Text>
                        <TouchableOpacity
                            onPress={() => {
                                // setFlowType('enroll');
                                navigation.navigate('Enrollment', { screen: 'Identifier' });
                            }}
                            activeOpacity={0.9}
                            className="bg-green-600 rounded-3xl p-6"
                        >
                            <View className="flex-row items-center mb-4">
                                <View className="w-12 h-12 bg-green-100 rounded-2xl items-center justify-center mr-4">
                                    <Ionicons name="person-add" size={24} color="#059669" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-xl font-bold text-white mb-1">New Verification</Text>
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
                                    onPress={() => {
                                        if (action.route === 'Enrollment') {
                                            // setFlowType('enroll');
                                            navigation.navigate('Enrollment', { screen: 'Identifier' });
                                        } else if (action.route === 'DocumentVerification') {
                                            // setFlowType('scan');
                                            navigation.navigate('DocumentVerification', { screen: 'Identifier' });
                                        } else {
                                            navigation.navigate(action.route);
                                        }
                                    }}
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
                            <TouchableOpacity onPress={() => navigation.navigate('History')}>
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
