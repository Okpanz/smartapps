import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTabBarBottomInset } from '../../navigation/TabNavigator';
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
import { resumeVerification } from '../../services/enrollment';

import { useEnrollmentStore } from '../../hooks/useEnrollmentStore';
import { isSmallDevice } from '../../utils/responsive';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput } from 'react-native';

export default function DashboardScreen() {
    const navigation = useNavigation<any>();
    const bottomInset = useTabBarBottomInset();
    const {
        user,
        logout,
        syncStatus,
        setSyncStatus,
        syncProgress,
        setSyncProgress,
        setLastSyncTime,
        pendingUploadsCount,
        uploadStatus
    } = useAuthStore();
    const { flags, fetchForCurrentService, get } = useFeatureFlags();

    // const setFlowType = useEnrollmentStore((state) => state.setFlowType);

    const [recentActivities, setRecentActivities] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<any[]>([
        { label: 'Total', value: '...', change: '...' },
        { label: 'VERIFIED', value: '...', change: '...' },
        { label: 'UNVERIFIED', value: '...', change: '...' },
        { label: 'This Month', value: '...', change: '...' },
        {label: 'Pending', value: '...', change: '...'}
    ]);

    useEffect(() => {
        // Check for pending enrollments on mount
        checkPendingEnrollments();
    }, []);

    useEffect(() => {
        fetchForCurrentService();
    }, [user?.service_id]);
    useEffect(() => {
        const performAutoSync = async () => {
            // 1. Handle First-Time Login Auto Download
             if (user?.is_first_device_login && user?.service_id && syncStatus === 'idle' && useFeatureFlags.getState().get('offline_record_download', true)) {
                console.log('[Dashboard] First time login flag detected. Starting auto-download...');
                try {
                    setSyncStatus('syncing');
                    setSyncProgress(0);

                    // Clear the flag immediately to prevent loop
                    const updatedUser = { ...user, is_first_device_login: false };
                    await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
                  

                     await downloadOfflineRecords((count, percentage) => {
                        if (percentage !== undefined) {
                            setSyncProgress(percentage);
                        }
                    }, user.service_id);

                    setSyncStatus('success');
                    setSyncProgress(100);
                    setLastSyncTime(new Date());
                    console.log('[Dashboard] First-time automatic download completed');
                } catch (error) {
                    console.error('[Dashboard] First-time automatic download failed', error);
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

            const total = (data as any)?.total ?? (data as any)?.totalVerified ?? { value: 0, change: '0%' };
            const verified = (data as any)?.verified ?? { value: 0, change: '0%' };
            const unverified = (data as any)?.unverified ?? (data as any)?.pending ?? { value: 0, change: '0%' };
            const thisMonth = (data as any)?.thisMonth ?? { value: 0, change: '0%' };

            setStats([
                { label: 'Total', value: total.value, change: total.change },
                { label: 'VERIFIED', value: verified.value, change: verified.change },
                { label: 'UNVERIFIED', value: unverified.value, change: pendingUploadsCount > 0 ? `Local +${pendingUploadsCount}` : unverified.change },
                { label: 'This Month', value: thisMonth.value, change: thisMonth.change },
                { label: 'Pending', value: pendingUploadsCount.toString(), change: 'Local' },
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

                if (String(log.action).includes('RESUME')) {
                    icon = 'refresh';
                    bgIcon = 'bg-purple-100';
                    iconColor = '#8B5CF6';
                    name = log.details?.employeeName || 'Resume Verification';
                    type = 'Resume Verification';
                    statusColor = 'text-purple-600';
                } else if (log.action.includes('ENROLLMENT')) {
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

    const [resumeEmployeeId, setResumeEmployeeId] = useState('');
    const [resuming, setResuming] = useState(false);
    const handleResume = async () => {
        if (!resumeEmployeeId.trim()) return;
        setResuming(true);
        try {
            await resumeVerification(resumeEmployeeId.trim());
            navigation.navigate('ResumeVerification', { screen: 'Details', params: { resumeFlow: true } });
        } catch (e) {
            Alert.alert('Resume Failed', 'No resume data found or server error. Please check the ID and try again.');
        } finally {
            setResuming(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigation.replace('Landing');
    };


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


    ].filter((action) => {
        if (action.route === 'DocumentVerification') {
            // Require both general verification and new verification flow enabled
            return get('verification_general', true) && get('document_upload', true);
        }
        if (action.route === 'AI') {
            return get('ai_enabled', false);
        }
        return true;
    });

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                contentContainerStyle={{ paddingBottom: bottomInset }}
            >
                {/* Header */}
                <View className="px-6 pt-6 pb-8 bg-white">
                    <View className="flex-row justify-between items-start mb-6">
                        <View className="flex-1">
                            <Text className="text-sm text-gray-500 font-medium mb-1">Welcome back 👋</Text>
                            <Text className="text-2xl font-bold text-gray-900">{user?.name || 'User'}</Text>
                        </View>

                    </View>

                    {/* Sync Progress */}
                    {syncStatus === 'syncing' && (
                        <View className="mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <View className="flex-row justify-between items-center mb-2">
                                <Text className="text-sm font-semibold text-green-900">Syncing Offline Records...</Text>
                                <Text className="text-sm font-bold text-green-900">{syncProgress}%</Text>
                            </View>
                            <View className="h-2 bg-green-200 rounded-full overflow-hidden">
                                <View className="h-full bg-green-500 rounded-full" style={{ width: `${syncProgress}%` }} />
                            </View>
                        </View>
                    )}

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
                        {(() => {
                            const canStartNew = get('verification_general', true) && get('new_verification_enabled', true);
                            return (
                        <TouchableOpacity
                            onPress={() => {
                                // setFlowType('enroll');
                                if (!canStartNew) return;
                                navigation.navigate('Enrollment', { screen: 'Identifier' });
                            }}
                            activeOpacity={canStartNew ? 0.9 : 1}
                            disabled={!canStartNew}
                            className={`${canStartNew ? 'bg-green-600' : 'bg-gray-300'} rounded-3xl p-6`}
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
                            );
                        })()}
                    </View>

                    <View className="mb-8">
                        <Text className="text-lg font-bold text-gray-900 mb-4">
                            Resume Verification
                        </Text>

                        <View className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">

                            {/* Header */}
                            <View className="flex-row items-center mb-4">
                                <View className="w-12 h-12 bg-purple-100 rounded-2xl items-center justify-center mr-3">
                                    <Ionicons name="refresh-circle" size={24} color="#8B5CF6" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-base font-bold text-gray-900">
                                        Continue Existing Verification
                                    </Text>
                                    <Text className="text-xs text-gray-500 mt-0.5">
                                        Enter the employee ID to continue from where you stopped.
                                    </Text>
                                </View>
                            </View>

                            {/* Input */}
                            <View className="mb-3">
                                <TextInput
                                    className="h-12 px-4 rounded-xl border bg-gray-50 text-gray-900 text-base border-gray-200"
                                    placeholder="e.g. EMP-10234"
                                    placeholderTextColor="#9CA3AF"
                                    value={resumeEmployeeId}
                                    onChangeText={setResumeEmployeeId}
                                    autoCapitalize="characters"
                                />
                            </View>

                            {/* Button */}
                            <Button
                                title={resuming ? "Resuming..." : "Resume Verification"}
                                onPress={handleResume}
                                loading={resuming}
                                disabled={!resumeEmployeeId.trim()}
                                className="mt-1"
                                variant="filled"
                            />

                        </View>
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
