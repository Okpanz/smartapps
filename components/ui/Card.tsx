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
                return "bg-surface border border-gray-200";
            case 'filled':
                return "bg-gray-100";
            case 'elevated':
            default:
                return "bg-white shadow-sm";
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
