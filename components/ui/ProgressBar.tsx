import React from 'react';
import { View, DimensionValue } from 'react-native';

interface ProgressBarProps {
    progress: number; // 0 to 1
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
    return (
        <View className="h-2 bg-gray-200 rounded-full overflow-hidden w-full">
            <View
                className="h-full bg-primary rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` as DimensionValue }}
            />
        </View>
    );
};

