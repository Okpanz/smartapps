
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface SkeletonProps {
    width?: number | string;
    height?: number | string;
    borderRadius?: number;
    className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
    width = '100%', 
    height = 20, 
    borderRadius = 8,
    className 
}) => {
    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(animatedValue, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true
            })
        ).start();
    }, [animatedValue]);

    const opacity = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.8]
    });

    return (
        <Animated.View
            style={[
                styles.skeleton,
                {
                    width,
                    height,
                    borderRadius,
                    opacity
                }
            ]}
            className={className}
        />
    );
};

const styles = StyleSheet.create({
    skeleton: {
        backgroundColor: '#E5E7EB',
    }
});
