import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

interface ProgressBarProps {
    progress: number; // 0 to 1
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
    const animatedWidth = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(animatedWidth, {
            toValue: progress,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
        }).start();
    }, [progress]);

    const widthPercentage = animatedWidth.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <View className="h-2.5 bg-outline rounded-full overflow-hidden w-full">
            <Animated.View
                className="h-full bg-secondary rounded-full"
                style={{ width: widthPercentage }}
            />
        </View>
    );
};
