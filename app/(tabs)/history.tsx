import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { DUMMY_ACTIVITIES } from '../../constants/dummyData';

export default function HistoryScreen() {
    const activities = DUMMY_ACTIVITIES;

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className="px-6 py-6 border-b border-gray-100 bg-white">
                <Text className="text-2xl font-bold text-gray-900">Activity History</Text>
                <Text className="text-sm text-gray-500 font-medium">View all recent biometric actions</Text>
            </View>

            <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
                <View className="gap-3 pb-8">
                    {activities.map((activity) => (
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
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
