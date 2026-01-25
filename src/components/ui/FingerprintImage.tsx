import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

interface FingerprintImageProps {
    base64Data: string | null;
    width?: number;
    height?: number;
    quality?: number;
    showQuality?: boolean;
}

export const FingerprintImage: React.FC<FingerprintImageProps> = ({
    base64Data,
    width = 240,
    height = 240,
    quality = 0,
    showQuality = false
}) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    if (!base64Data) {
        return (
            <View style={[styles.container, { width, height }]}>
                <Ionicons name="finger-print" size={80} color="#9CA3AF" />
                <Text style={styles.noImageText}>No Image</Text>
            </View>
        );
    }

    // Clean the base64 data
    const cleanBase64 = base64Data.replace(/\s/g, '');
    const imageUri = `data:image/png;base64,${cleanBase64}`;

    return (
        <View style={[styles.container, { width, height }]}>
            {!imageError ? (
                <>
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        resizeMode="contain"
                        onError={(error) => {
                            console.error('FingerprintImage load error:', error.nativeEvent.error);
                            setImageError(true);
                        }}
                        onLoad={() => {
                            console.log('FingerprintImage loaded successfully');
                            setImageLoaded(true);
                        }}
                    />
                    {!imageLoaded && (
                        <View style={styles.loadingOverlay}>
                            <Text style={styles.loadingText}>Loading...</Text>
                        </View>
                    )}
                </>
            ) : (
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={60} color="#EF4444" />
                    <Text style={styles.errorText}>Failed to load image</Text>
                    <Text style={styles.errorSubtext}>
                        Data length: {cleanBase64.length}
                    </Text>
                </View>
            )}
            
            {showQuality && imageLoaded && !imageError && (
                <View style={styles.qualityBadge}>
                    <Text style={styles.qualityText}>Quality: {quality}%</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#6B7280',
        fontSize: 12,
        fontWeight: '500',
    },
    errorContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 12,
    },
    errorSubtext: {
        color: '#9CA3AF',
        fontSize: 10,
        marginTop: 4,
    },
    noImageText: {
        color: '#9CA3AF',
        fontSize: 12,
        marginTop: 8,
    },
    qualityBadge: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingVertical: 8,
        alignItems: 'center',
    },
    qualityText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
});
