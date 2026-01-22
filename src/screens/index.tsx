import React from 'react';
import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigation } from '@react-navigation/native';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { login } from '../services/auth';
import { useAuthStore } from '../hooks/useAuthStore';
import { useState } from 'react';

const loginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
    const navigation = useNavigation<any>();
    const setAuthUser = useAuthStore((state) => state.login);
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, formState: { errors } } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data: LoginForm) => {
        setLoading(true);
        try {
            const user = await login(data.username, data.password);
            setAuthUser(user);
            navigation.replace('Tabs');
        } catch (error: any) {
            Alert.alert('Login Failed', error.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="flex-1 justify-center p-4">
                <Card className="p-8 pb-10">
                    <Text className="text-3xl font-bold text-primary text-center mb-2">Smart Verify</Text>
                    <Text className="text-base text-gray-600 text-center mb-8">Secure Enrollment Access</Text>

                    <Input
                        label="Username"
                        name="username"
                        control={control}
                        placeholder="Enter username"
                        autoCapitalize="none"
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
                </Card>
            </View>
        </SafeAreaView>
    );
}
