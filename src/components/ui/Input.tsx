import { View, TextInput, Text, TouchableOpacity } from 'react-native';
import { Control, Controller } from 'react-hook-form';
import { useState } from 'react';
import { COLORS } from '../../constants/theme'; // Can keep for cursor color if needed, or use raw hex
import React from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';

interface InputProps extends React.ComponentProps<typeof TextInput> {
    label: string;
    name: string;
    control: Control<any>;
    error?: string;
    helperText?: string;
}

export const Input = ({ label, name, control, error, helperText, secureTextEntry, ...props }: InputProps) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isSecure, setIsSecure] = useState(secureTextEntry);

    return (
        <View className="mb-4">
            <Text className={`text-sm font-medium mb-1.5 ${error ? 'text-red-500' : 'text-gray-700'}`}>
                {label}
            </Text>

            <Controller
                control={control}
                name={name}
                render={({ field: { onChange, onBlur, value } }) => (
                    <View className="relative">
                        <TextInput
                            className={`
                                h-12 px-4 rounded-xl border bg-white text-gray-900 text-base
                                ${error
                                    ? 'border-red-500 bg-red-50'
                                    : isFocused
                                        ? 'border-primary bg-primary/5'
                                        : 'border-gray-200'
                                }
                                ${secureTextEntry ? 'pr-12' : ''}
                            `}
                            onBlur={() => {
                                setIsFocused(false);
                                onBlur();
                            }}
                            onFocus={() => setIsFocused(true)}
                            onChangeText={onChange}
                            value={value}
                            cursorColor={COLORS.primary}
                            placeholderTextColor="#9CA3AF"
                            secureTextEntry={isSecure}
                            {...props}
                        />
                        {secureTextEntry && (
                            <TouchableOpacity
                                onPress={() => setIsSecure(!isSecure)}
                                className="absolute right-4 top-3"
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons
                                    name={isSecure ? "eye-off-outline" : "eye-outline"}
                                    size={24}
                                    color="#9CA3AF"
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            />
            {error && <Text className="text-red-500 text-sm mt-1 ml-1">{error}</Text>}
            {!error && helperText && <Text className="text-gray-500 text-xs mt-1 ml-1">{helperText}</Text>}
        </View>
    );
};

