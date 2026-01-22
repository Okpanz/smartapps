import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

interface ButtonProps extends React.ComponentProps<typeof TouchableOpacity> {
    title: string;
    loading?: boolean;
    variant?: 'filled' | 'outlined' | 'text' | 'tonal';
    icon?: React.ReactNode;
    className?: string;
    textClassName?: string;
}

export const Button = ({ title, loading, variant = 'filled', style, disabled, icon, className, textClassName, ...props }: ButtonProps) => {
    const baseStyle = "flex-row items-center justify-center py-3.5 px-6 rounded-2xl min-h-[52px]";

    const getVariantStyle = () => {
        switch (variant) {
            case 'outlined':
                return "border border-outline bg-transparent"; // ensure outline color is defined or use border-gray-400
            case 'text':
                return "bg-transparent";
            case 'tonal':
                return "bg-primary/10"; // opacity syntax requires tailwind config support or manual
            case 'filled':
            default:
                return "bg-primary";
        }
    };

    const getTextColor = () => {
        switch (variant) {
            case 'outlined':
            case 'text':
                return "text-primary";
            case 'tonal':
                return "text-primary";
            default:
                return "text-white";
        }
    };

    return (
        <TouchableOpacity
            className={`${baseStyle} ${getVariantStyle()} ${disabled ? 'opacity-50' : ''} ${className || ''}`}
            disabled={disabled || loading}
            activeOpacity={0.7}
            style={style as any}
            {...props}
        >
            {loading ? (
                <ActivityIndicator color={variant === 'filled' ? 'white' : '#02542D'} />
            ) : (
                <>
                    {icon && <Text className="mr-2">{icon}</Text>}
                    <Text className={`font-semibold text-base text-center ${getTextColor()} ${textClassName || ''}`}>
                        {title}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
};

