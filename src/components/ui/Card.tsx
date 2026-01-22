import React from 'react';
import { View } from 'react-native';

interface CardProps extends React.ComponentProps<typeof View> {
    children: React.ReactNode;
    variant?: 'elevated' | 'outlined' | 'filled';
    className?: string; // Add className support
}

export const Card = ({ children, style, variant = 'elevated', className, ...props }: CardProps) => {
    const getVariantClass = () => {
        switch (variant) {
            case 'outlined':
                return "bg-card border border-outline";
            case 'filled':
                return "bg-primary/5";
            case 'elevated':
            default:
                return "bg-card shadow-lg shadow-black/5";
        }
    };

    return (
        <View
            className={`rounded-[24px] p-5 mb-4 ${getVariantClass()} ${className || ''}`}
            style={style}
            {...props}
        >
            {children}
        </View>
    );
};
