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
import { login, biometricLogin } from '../services/auth';
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
    
    // Use individual selectors to avoid unnecessary re-renders
    const setAuthUser = useAuthStore((state) => state.login);
    const loadUserFromStorage = useAuthStore((state) => state.loadUserFromStorage);
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);

    const [loading, setLoading] = useState(false);
    const [canUseBiometrics, setCanUseBiometrics] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [biometricPrompted, setBiometricPrompted] = useState(false);
    
    const rnBiometrics = new ReactNativeBiometrics();

    const { control, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: '',
            password: ''
        }
    });

    // Initial Load
    useEffect(() => {
        loadUserFromStorage();
    }, []);

    // Handle Returning User State
    useEffect(() => {
        if (user) {
            setIsLocked(true);
            if (user.email || user.username) {
                setValue('username', user.email || user.username);
            }
        }
    }, [user, setValue]);

    // Auto-Biometric Prompt for Locked State
    useEffect(() => {
        if (isLocked && !biometricPrompted) {
            checkAndPromptBiometrics();
        }
    }, [isLocked, biometricPrompted]);

    const checkAndPromptBiometrics = async () => {
        try {
            const enabled = await AsyncStorage.getItem('biometricEnabled');
            
            if (enabled === 'true') {
                setCanUseBiometrics(true);
                // Attempt auto-prompt
                setTimeout(() => handleBiometricLogin(), 500);
            }
            setBiometricPrompted(true);
        } catch (error) {
            console.error('Failed to check biometric status', error);
        }
    };

    const handleBiometricLogin = async () => {
        try {
            const { success } = await rnBiometrics.simplePrompt({ promptMessage: 'Login with Biometrics' });
            if (success) {
                console.log('Biometric prompt successful, attempting to refresh session...');
                setLoading(true);
                try {
                    const userData = await biometricLogin();
                    setAuthUser(userData);
                    
                    // Show offline toast/alert if we fell back to local data
                    // We can check this by comparing userData with what we expect from a fresh login,
                    // or simply trust that if it didn't throw, we are good.
                    // Ideally biometricLogin could return a status flag, but for now let's just proceed.
                    // If the user is offline, some features might not work, but they can access the app.
                    
                    navigation.replace('Tabs');
                } catch (apiError) {
                    console.error('Biometric backend auth failed', apiError);
                    Alert.alert('Login Failed', 'Session expired or network unavailable. Please login with password.');
                } finally {
                    setLoading(false);
                }
            }
        } catch (error) {
            console.log('Biometric login failed or cancelled', error);
        }
    };

    const handleSwitchAccount = async () => {
        await logout();
        setIsLocked(false);
        setBiometricPrompted(false);
        setValue('username', '');
        setValue('password', '');
    };

    const onSubmit = async (data: LoginForm) => {
        if (!data.username || !data.username.trim() || !data.password || !data.password.trim()) {
             Alert.alert('Validation Error', 'Please enter both email and password.');
             return;
        }

        setLoading(true);
        console.log('Attempting login with:', data.username);
        try {
            const loggedInUser = await login(data.username, data.password);
            console.log('Login successful, user:', loggedInUser);
            
            if (!loggedInUser || !loggedInUser.id) {
                 throw new Error('Login returned invalid user data');
            }

            setAuthUser(loggedInUser);
            navigation.replace('Tabs');
        } catch (error: any) {
            console.error('Login error:', error);
            const message = error.response?.data?.message || error.message || 'An error occurred';
            Alert.alert('Login Failed', message);
        } finally {
            setLoading(false);
        }
    };

    const getLastName = (fullName: string) => {
        if (!fullName) return '';
        const parts = fullName.split(' ');
        return parts.length > 1 ? parts[parts.length - 1] : fullName;
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="flex-1 justify-center p-4">
                <Card className="p-8 pb-10">
                    <Text className="text-3xl font-bold text-primary text-center mb-2">Smart Verification</Text>
                    
                    {isLocked && user ? (
                        <View className="mb-8">
                             <Text className="text-xl text-gray-800 text-center font-medium mt-2">
                                Welcome, {getLastName(user.name)}
                            </Text>
                            <Text className="text-sm text-gray-500 text-center mt-1">
                                Please verify your identity
                            </Text>
                        </View>
                    ) : (
                        <>
                            <Text className="text-base text-gray-600 text-center mb-2">Secure Verification Access</Text>
                            <Text className="text-xs text-gray-400 text-center mb-8">v1.1 (Beta Version)</Text>
                        </>
                    )}

                    {!isLocked && (
                        <Input
                            label="Email Address"
                            name="username"
                            control={control}
                            placeholder="Enter your email"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            error={errors.username?.message}
                        />
                    )}

                    <Input
                        label="Password"
                        name="password"
                        control={control}
                        placeholder="Enter password"
                        secureTextEntry
                        error={errors.password?.message}
                        helperText={isLocked ? "Enter your password to unlock" : "Use your employee credentials"}
                    />

                    <Button
                        title={isLocked ? "Unlock" : "Login"}
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
                            <Text className="text-primary font-semibold ml-2">
                                {isLocked ? "Unlock with Biometrics" : "Login with Biometrics"}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {isLocked && (
                        <TouchableOpacity 
                            onPress={handleSwitchAccount}
                            className="mt-4 flex-row items-center justify-center py-2"
                        >
                            <Text className="text-gray-500 font-medium text-sm">Switch Account</Text>
                        </TouchableOpacity>
                    )}
                </Card>
            </View>
        </SafeAreaView>
    );
}
