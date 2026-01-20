import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useRouter } from 'expo-router';
import React from 'react';

export default function SettingsScreen() {
    const logout = useAuthStore((state) => state.logout);
    const router = useRouter();

    const handleLogout = () => {
        logout();
        router.replace('/');
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="flex-1 justify-center items-center">
                <Text className="text-xl font-bold text-gray-800 mb-6">Settings</Text>

                <TouchableOpacity
                    onPress={handleLogout}
                    className="bg-red-50 px-6 py-3 rounded-xl border border-red-200"
                >
                    <Text className="text-red-600 font-semibold">Log Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
