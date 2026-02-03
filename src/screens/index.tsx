import React, { useState, useEffect } from 'react';
import { View, Text, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigation } from '@react-navigation/native';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { login, syncEmployees } from '../services/auth';
import { useAuthStore } from '../hooks/useAuthStore';
import ReactNativeBiometrics from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

const loginSchema = z.object({
    username: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
    const navigation = useNavigation<any>();
    
    // Use individual selectors to avoid unnecessary re-renders and "Maximum update depth exceeded" errors
    const setAuthUser = useAuthStore((state) => state.login);
    const loadUserFromStorage = useAuthStore((state) => state.loadUserFromStorage);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const user = useAuthStore((state) => state.user);

    const [loading, setLoading] = useState(false);
    
    const [canUseBiometrics, setCanUseBiometrics] = useState(false);
    const rnBiometrics = new ReactNativeBiometrics();

    useEffect(() => {
        checkBiometricAvailability();
        // Attempt to load user from SQLite cache
        loadUserFromStorage();
    }, []);

    useEffect(() => {
        if (isAuthenticated && user) {
            console.log('User loaded from cache/login, navigating to Tabs');
            navigation.replace('Tabs');
        }
    }, [isAuthenticated, user]);

    const checkBiometricAvailability = async () => {
        try {
            const enabled = await AsyncStorage.getItem('biometricEnabled');
            const userData = await AsyncStorage.getItem('userData');
            
            if (enabled === 'true' && userData) {
                setCanUseBiometrics(true);
                // Attempt auto-prompt after a short delay
                setTimeout(() => handleBiometricLogin(), 500);
            }
        } catch (error) {
            console.error('Failed to check biometric status', error);
        }
    };

    const handleBiometricLogin = async () => {
        try {
            const { success } = await rnBiometrics.simplePrompt({ promptMessage: 'Login with Biometrics' });
            if (success) {
                const userDataStr = await AsyncStorage.getItem('userData');
                if (userDataStr) {
                    const user = JSON.parse(userDataStr);
                    console.log('Biometric login successful for:', user.email);
                    setAuthUser(user);
                    navigation.replace('Tabs');
                }
            }
        } catch (error) {
            console.log('Biometric login failed or cancelled', error);
        }
    };

    const { control, handleSubmit, formState: { errors } } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: '',
            password: ''
        }
    });

    const onSubmit = async (data: LoginForm) => {
        if (!data.username || !data.username.trim() || !data.password || !data.password.trim()) {
             Alert.alert('Validation Error', 'Please enter both email and password.');
             return;
        }

        setLoading(true);
        console.log('Attempting login with:', data.username);
        try {
            const user = await login(data.username, data.password);
            console.log('Login successful, user:', user);
            
            if (!user || !user.id) {
                 throw new Error('Login returned invalid user data');
            }

            // Sync employees data - DISABLED temporarily
            // try {
            //     if (user.service_id) {
            //         await syncEmployees(user.service_id);
            //     } else {
            //         await syncEmployees();
            //     }
            // } catch (syncError) {
            //     console.warn('Employee sync failed, but proceeding with login:', syncError);
            // }

            setAuthUser(user);
            navigation.replace('Tabs');
        } catch (error: any) {
            console.error('Login error:', error);
            const message = error.response?.data?.message || error.message || 'An error occurred';
            Alert.alert('Login Failed', message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="flex-1 justify-center p-4">
                <Card className="p-8 pb-10">
                    <Text className="text-3xl font-bold text-primary text-center mb-2">Smart Verification</Text>
                    <Text className="text-base text-gray-600 text-center mb-2">Secure Enrollment Access</Text>
                    <Text className="text-xs text-gray-400 text-center mb-8">v1.1 (Local Version)</Text>

                    <Input
                        label="Email Address"
                        name="username"
                        control={control}
                        placeholder="Enter your email"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        error={errors.username?.message}
                    />

                    <Input
                        label="Password"
                        name="password"
                        control={control}
                        placeholder="Enter password"
                        secureTextEntry
                        error={errors.password?.message}
                        helperText="Use your employee credentials"
                    />

                    <Button
                        title="Login"
                        onPress={handleSubmit(onSubmit)}
                        loading={loading}
                        className="mt-4"
                        variant="filled"
                    />

                    {/* Biometric Login Button */}
                    {canUseBiometrics && (
                        <TouchableOpacity 
                            onPress={handleBiometricLogin}
                            className="mt-6 flex-row items-center justify-center py-2"
                        >
                            <Ionicons name="finger-print-outline" size={24} color="#10B981" />
                            <Text className="text-primary font-semibold ml-2">Login with Biometrics</Text>
                        </TouchableOpacity>
                    )}
                </Card>
            </View>
        </SafeAreaView>
    );
}
