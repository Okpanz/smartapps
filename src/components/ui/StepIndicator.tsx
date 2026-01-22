import React from 'react';
import { View, Text } from 'react-native';

interface StepIndicatorProps {
    currentStep: number;
    totalSteps: number;
}

export const StepIndicator = ({ currentStep, totalSteps }: StepIndicatorProps) => {
    return (
        <View className="flex-row items-center justify-center mb-8">
            {Array.from({ length: totalSteps }).map((_, index) => {
                const stepNum = index + 1;
                const isActive = stepNum === currentStep;
                const isCompleted = stepNum < currentStep;

                return (
                    <View key={index} className="flex-row items-center">
                        <View className={`
                            w-8 h-8 rounded-full items-center justify-center border
                            ${isActive ? 'bg-primary/10 border-primary' : isCompleted ? 'bg-primary border-primary' : 'bg-gray-200 border-transparent'}
                        `}>
                            <Text className={`
                                text-sm font-semibold
                                ${isActive ? 'text-primary' : isCompleted ? 'text-white' : 'text-gray-500'}
                            `}>
                                {stepNum}
                            </Text>
                        </View>
                        {index < totalSteps - 1 && (
                            <View className={`
                                w-5 h-0.5 mx-1
                                ${isCompleted ? 'bg-primary' : 'bg-gray-200'}
                            `} />
                        )}
                    </View>
                );
            })}
        </View>
    );
};

