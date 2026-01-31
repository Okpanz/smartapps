import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { getRecentActivity } from '../../services/activity';
import { formatDistanceToNow } from 'date-fns';

export default function HistoryScreen() {
    const [activities, setActivities] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const fetchActivities = async () => {
        try {
            const logs = await getRecentActivity(20);
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
                    name = log.details?.employeeName || 'New Enrollment';
                    type = 'Employee Enrollment';
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
            setActivities(mappedActivities);
        } catch (error) {
            console.error('Failed to load history', error);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchActivities();
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchActivities();
        setRefreshing(false);
    }, []);

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className="px-6 py-6 border-b border-gray-100 bg-white">
                <Text className="text-2xl font-bold text-gray-900">Activity History</Text>
                <Text className="text-sm text-gray-500 font-medium">View all recent biometric actions</Text>
            </View>

            <ScrollView 
                className="flex-1 px-6 pt-4" 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <View className="gap-3 pb-8">
                    {activities.length === 0 ? (
                        <Text className="text-center text-gray-500 mt-10">No recent activity</Text>
                    ) : (
                        activities.map((activity) => (
                            <TouchableOpacity
                                key={activity.id}
                                activeOpacity={0.7}
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
                                        <View className="flex-row items-center">
                                            <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${activity.status === 'Completed' ? 'bg-green-500' : activity.status === 'Pending' ? 'bg-amber-500' : 'bg-red-500'}`} />
                                            <Text className={`text-xs font-bold ${activity.statusColor}`}>{activity.status}</Text>
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
