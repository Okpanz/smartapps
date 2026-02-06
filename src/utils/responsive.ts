import { Dimensions, PixelRatio } from 'react-native';

const { width, height } = Dimensions.get('window');

// Standard reference based on iPhone 11/Pro/X
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

export const scale = (size: number) => (width / guidelineBaseWidth) * size;
export const verticalScale = (size: number) => (height / guidelineBaseHeight) * size;
export const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;

export const SCREEN_WIDTH = width;
export const SCREEN_HEIGHT = height;

export const isSmallDevice = width < 380;

// Helper for responsive padding/margin
export const wp = (percentage: number) => {
    const value = (percentage * width) / 100;
    return Math.round(value);
};

export const hp = (percentage: number) => {
    const value = (percentage * height) / 100;
    return Math.round(value);
};
