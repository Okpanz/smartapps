import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { getRecentActivity } from '../../services/activity';
import { formatDistanceToNow, format, eachDayOfInterval, parseISO, isBefore } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import { isSmallDevice } from '../../utils/responsive';

export default function HistoryScreen() {
    const [activities, setActivities] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [isFilterModalVisible, setFilterModalVisible] = useState(false);

    // Filter States
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
    
    // Date Range State
    const [startDate, setStartDate] = useState<string | undefined>(undefined);
    const [endDate, setEndDate] = useState<string | undefined>(undefined);

    // Active Filters (applied)
    const [appliedFilters, setAppliedFilters] = useState<{
        action?: string;
        start?: string;
        end?: string;
    }>({});

    const fetchActivities = async () => {
        try {
            const logs = await getRecentActivity(20, search, { 
                startDate: appliedFilters.start, 
                endDate: appliedFilters.end, 
                action: appliedFilters.action 
            });
            
            const mappedActivities = logs.map(log => {
                let icon = 'ellipse';
                let bgIcon = 'bg-gray-100';
                let iconColor = '#6B7280';
                let statusColor = 'text-gray-500';
                let name = 'System Activity';
                let type = log.action;

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
                } else if (log.action.includes('LOGIN')) {
                    icon = 'log-in';
                    bgIcon = 'bg-purple-100';
                    iconColor = '#8B5CF6';
                    name = 'User Login';
                    type = 'System Access';
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
        }, [appliedFilters])
    );

    // Search effect
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchActivities();
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchActivities();
        setRefreshing(false);
    }, [search, appliedFilters]);

    // Calendar Logic
    const onDayPress = (day: any) => {
        if (!startDate || (startDate && endDate)) {
            setStartDate(day.dateString);
            setEndDate(undefined);
        } else if (startDate && !endDate) {
            if (isBefore(parseISO(day.dateString), parseISO(startDate))) {
                setStartDate(day.dateString);
            } else {
                setEndDate(day.dateString);
            }
        }
    };

    const markedDates = useMemo(() => {
        if (!startDate) return {};
        
        let marks: any = {
            [startDate]: { startingDay: true, color: '#2563EB', textColor: 'white' }
        };

        if (endDate) {
            marks[endDate] = { endingDay: true, color: '#2563EB', textColor: 'white' };
            
            const days = eachDayOfInterval({
                start: parseISO(startDate),
                end: parseISO(endDate)
            });

            days.forEach((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                if (dateStr !== startDate && dateStr !== endDate) {
                    marks[dateStr] = { color: '#DBEAFE', textColor: '#1E3A8A' };
                }
            });
        }

        return marks;
    }, [startDate, endDate]);

    const applyFilters = () => {
        setAppliedFilters({
            action: actionFilter,
            start: startDate,
            end: endDate
        });
        setFilterModalVisible(false);
    };

    const resetFilters = () => {
        setActionFilter(undefined);
        setStartDate(undefined);
        setEndDate(undefined);
        setAppliedFilters({});
        setFilterModalVisible(false);
    };

    const ActionChip = ({ label, value }: { label: string, value: string | undefined }) => (
        <TouchableOpacity 
            onPress={() => setActionFilter(actionFilter === value ? undefined : value)}
            className={`px-4 py-2 rounded-full mr-2 mb-2 border ${actionFilter === value ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
        >
            <Text className={`text-sm font-medium ${actionFilter === value ? 'text-white' : 'text-gray-600'}`}>
                {label}
            </Text>
        </TouchableOpacity>
    );

    const hasActiveFilters = appliedFilters.action || appliedFilters.start;

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className={`py-4 border-b border-gray-100 bg-white z-10 ${isSmallDevice ? 'px-4' : 'px-6'}`}>
                <Text className="text-2xl font-bold text-gray-900 mb-4">Activity History</Text>
                
                {/* Search Bar & Filter Button */}
                <View className="flex-row items-center gap-3">
                    <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-4 py-2">
                        <Ionicons name="search" size={20} color="#9CA3AF" />
                        <TextInput
                            className="flex-1 ml-2 text-gray-900 text-base"
                            placeholder="Search activities..."
                            value={search}
                            onChangeText={setSearch}
                            placeholderTextColor="#9CA3AF"
                        />
                        {search.length > 0 && (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    <TouchableOpacity 
                        onPress={() => setFilterModalVisible(true)}
                        className={`w-12 h-12 rounded-xl items-center justify-center ${hasActiveFilters ? 'bg-blue-600' : 'bg-gray-100'}`}
                    >
                        <Ionicons name="options" size={24} color={hasActiveFilters ? "white" : "#4B5563"} />
                    </TouchableOpacity>
                </View>

                {/* Active Filters Summary */}
                {hasActiveFilters && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
                        {appliedFilters.action && (
                            <View className="bg-blue-50 px-3 py-1 rounded-full mr-2 flex-row items-center border border-blue-100">
                                <Text className="text-blue-700 text-xs font-medium mr-1">{appliedFilters.action}</Text>
                                <TouchableOpacity onPress={() => setAppliedFilters({...appliedFilters, action: undefined})}>
                                    <Ionicons name="close" size={14} color="#1D4ED8" />
                                </TouchableOpacity>
                            </View>
                        )}
                        {appliedFilters.start && (
                            <View className="bg-blue-50 px-3 py-1 rounded-full mr-2 flex-row items-center border border-blue-100">
                                <Text className="text-blue-700 text-xs font-medium mr-1">
                                    {appliedFilters.start} {appliedFilters.end ? `- ${appliedFilters.end}` : ''}
                                </Text>
                                <TouchableOpacity onPress={() => setAppliedFilters({...appliedFilters, start: undefined, end: undefined})}>
                                    <Ionicons name="close" size={14} color="#1D4ED8" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>

            <ScrollView 
                className={`flex-1 pt-4 ${isSmallDevice ? 'px-4' : 'px-6'}`}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <View className="gap-3 pb-8">
                    {activities.length === 0 ? (
                        <View className="items-center mt-10">
                            <Ionicons name="search-outline" size={48} color="#D1D5DB" />
                            <Text className="text-center text-gray-500 mt-4 text-base">No activities found</Text>
                            <Text className="text-center text-gray-400 text-sm mt-1">Try adjusting your filters</Text>
                        </View>
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

            {/* Filter Modal */}
            <Modal
                visible={isFilterModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setFilterModalVisible(false)}
            >
                <View className="flex-1 bg-gray-50">
                    {/* Modal Header */}
                    <View className="px-6 py-4 bg-white border-b border-gray-100 flex-row justify-between items-center">
                        <Text className="text-xl font-bold text-gray-900">Filter Activities</Text>
                        <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                            <Ionicons name="close" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView className="flex-1">
                        {/* Date Range Section */}
                        <View className="p-6 bg-white mb-4">
                            <Text className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">Date Range</Text>
                            <Calendar
                                markingType={'period'}
                                markedDates={markedDates}
                                onDayPress={onDayPress}
                                theme={{
                                    selectedDayBackgroundColor: '#2563EB',
                                    selectedDayTextColor: '#ffffff',
                                    todayTextColor: '#2563EB',
                                    arrowColor: '#2563EB',
                                }}
                            />
                            <View className="mt-4 flex-row justify-between">
                                <View>
                                    <Text className="text-xs text-gray-400 mb-1">Start Date</Text>
                                    <Text className="text-base font-medium text-gray-900">{startDate || 'Select date'}</Text>
                                </View>
                                <View>
                                    <Text className="text-xs text-gray-400 mb-1 text-right">End Date</Text>
                                    <Text className="text-base font-medium text-gray-900 text-right">{endDate || 'Select date'}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Action Type Section */}
                        <View className="p-6 bg-white">
                            <Text className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">Activity Type</Text>
                            <View className="flex-row flex-wrap">
                                <ActionChip label="All Actions" value={undefined} />
                                <ActionChip label="Enrollment" value="ENROLLMENT" />
                                <ActionChip label="Verification" value="VERIFICATION" />
                                <ActionChip label="Login" value="LOGIN" />
                            </View>
                        </View>
                    </ScrollView>

                    {/* Footer Actions */}
                    <View className="p-6 bg-white border-t border-gray-100 flex-row gap-4">
                        <TouchableOpacity 
                            onPress={resetFilters}
                            className="flex-1 py-3.5 rounded-xl border border-gray-200 items-center"
                        >
                            <Text className="font-semibold text-gray-700">Reset</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={applyFilters}
                            className="flex-1 py-3.5 rounded-xl bg-blue-600 items-center shadow-sm"
                        >
                            <Text className="font-semibold text-white">Apply Filters</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}