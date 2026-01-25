import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, Animated, StyleSheet, ViewStyle, Dimensions } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

interface EnhancedStepIndicatorProps {
    currentStep: number;
    totalSteps: number;
    stepLabels?: string[];
    primaryColor?: string;
    secondaryColor?: string;
    showPercentage?: boolean;
    showStepNumbers?: boolean;
    animationDuration?: number;
    customStepContent?: (step: number, isActive: boolean, isCompleted: boolean) => React.ReactNode;
}

export const EnhancedStepIndicator = ({
    currentStep,
    totalSteps,
    stepLabels = ['Identify', 'Verify', 'Capture', 'Review'],
    primaryColor = '#0c503aff',
    secondaryColor = '#D1FAE5',
    showPercentage = true,
    showStepNumbers = true,
    animationDuration = 300,
    customStepContent,
}: EnhancedStepIndicatorProps) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const scaleAnims = useRef<Animated.Value[]>([]);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const { width: screenWidth } = Dimensions.get('window');

    // Initialize animations for each step
    if (scaleAnims.current.length !== totalSteps) {
        scaleAnims.current = Array.from({ length: totalSteps }, (_, i) =>
            new Animated.Value(i + 1 === currentStep ? 1.15 : 1)
        );
    }

    // Memoize step calculations
    const steps = useMemo(() =>
        Array.from({ length: totalSteps }, (_, index) => ({
            number: index + 1,
            label: stepLabels[index] || `Step ${index + 1}`,
            isActive: index + 1 === currentStep,
            isCompleted: index + 1 < currentStep,
        }))
        , [totalSteps, stepLabels, currentStep]);

    useEffect(() => {
        // Animate progress bar
        Animated.timing(progressAnim, {
            toValue: currentStep - 1,
            duration: animationDuration,
            useNativeDriver: false,
        }).start();

        // Pulse animation for current step
        if (currentStep <= totalSteps) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.15,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }

        // Scale animations for step circles
        steps.forEach((step, index) => {
            if (step.isActive) {
                Animated.spring(scaleAnims.current[index], {
                    toValue: 1.15,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }).start();
            } else if (step.isCompleted) {
                scaleAnims.current[index].setValue(1);
            } else {
                Animated.spring(scaleAnims.current[index], {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }).start();
            }
        });

        return () => {
            pulseAnim.stopAnimation();
        };
    }, [currentStep, totalSteps]);

    // Interpolate progress for bar width
    const progressWidth = progressAnim.interpolate({
        inputRange: [0, totalSteps - 1],
        outputRange: ['0%', '100%'],
    });

    // Calculate completion percentage
    const completionPercentage = Math.round(((currentStep - 1) / (totalSteps - 1)) * 100);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.stepText}>
                    Step {currentStep} of {totalSteps}
                </Text>
                {showPercentage && (
                    <Text style={[styles.percentageText, { color: primaryColor }]}>
                        {completionPercentage}%
                    </Text>
                )}
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarBackground, { backgroundColor: secondaryColor }]}>
                    <Animated.View
                        style={[
                            styles.progressBarFill,
                            {
                                width: progressWidth,
                                backgroundColor: primaryColor,
                            },
                        ]}
                    />
                </View>
            </View>

            {/* Step Indicators */}
            <View style={styles.stepsContainer}>
                {steps.map((step, index) => {
                    const isLast = index === totalSteps - 1;
                    const stepAnim = scaleAnims.current[index];
                    const isCurrentStep = step.isActive;

                    return (
                        <View
                            key={`step-${index}`}
                            style={styles.stepWrapper}
                        >
                            {/* Step Circle */}
                            <Animated.View
                                style={[
                                    styles.stepCircle,
                                    step.isCompleted && { backgroundColor: primaryColor },
                                    step.isActive && {
                                        backgroundColor: primaryColor,
                                        transform: [{ scale: isCurrentStep ? pulseAnim : stepAnim }],
                                        shadowColor: primaryColor,
                                    },
                                    !step.isActive && !step.isCompleted && { backgroundColor: '#E5E7EB' },
                                ]}
                            >
                                {customStepContent ? (
                                    customStepContent(step.number, step.isActive, step.isCompleted)
                                ) : (
                                    <>
                                        {step.isCompleted ? (
                                            <Ionicons name="checkmark" size={20} color="white" />
                                        ) : (
                                            showStepNumbers && (
                                                <Text
                                                    style={[
                                                        styles.stepNumber,
                                                        step.isActive && styles.activeStepNumber,
                                                        !step.isActive && !step.isCompleted && styles.inactiveStepNumber,
                                                    ]}
                                                >
                                                    {step.number}
                                                </Text>
                                            )
                                        )}
                                    </>
                                )}
                            </Animated.View>

                            {/* Step Label */}
                            <Text
                                style={[
                                    styles.stepLabel,
                                    step.isActive && { color: primaryColor, fontWeight: '600' },
                                    step.isCompleted && { color: '#374151' },
                                    !step.isActive && !step.isCompleted && { color: '#9CA3AF' },
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.8}
                            >
                                {step.label}
                            </Text>


                            {!isLast && (
                                <View
                                    style={[
                                        styles.connectingLine,
                                        {
                                            backgroundColor: step.isCompleted ? primaryColor : '#E5E7EB',
                                            left: screenWidth / (totalSteps * 2),
                                            right: -screenWidth / (totalSteps * 2) + 20,
                                        },
                                    ]}
                                />
                            )}
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 24,
        paddingBottom: 16,
        backgroundColor: 'white',
        paddingTop: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    stepText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
    },
    percentageText: {
        fontSize: 14,
        fontWeight: '700',
    },
    progressBarContainer: {
        marginBottom: 24,
    },
    progressBarBackground: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    stepsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    stepWrapper: {
        flex: 1,
        alignItems: 'center',
        position: 'relative',
    },
    stepCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    stepNumber: {
        fontSize: 14,
        fontWeight: '700',
    },
    activeStepNumber: {
        color: 'white',
    },
    inactiveStepNumber: {
        color: '#6B7280',
    },
    stepLabel: {
        fontSize: 12,
        fontWeight: '500',
        textAlign: 'center',
        maxWidth: 80,
    },
    connectingLine: {
        position: 'absolute',
        top: 20,
        height: 2,
        zIndex: -1,
    },
});