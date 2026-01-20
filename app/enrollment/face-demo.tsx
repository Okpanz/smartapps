// app/enrollment/face-demo.tsx
// Demo version to test the 3-photo capture flow without camera
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FaceDemoScreen() {
    const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
    const [isCapturing, setIsCapturing] = useState(false);
    const REQUIRED_PHOTOS = 3;

    const simulatePhotoCapture = async () => {
        if (isCapturing || capturedPhotos.length >= REQUIRED_PHOTOS) return;
        
        setIsCapturing(true);
        
        // Simulate camera capture delay
        setTimeout(() => {
            const photoUri = `demo-photo-${Date.now()}.jpg`;
            setCapturedPhotos(prev => [...prev, photoUri]);
            
            Alert.alert(
                'Photo Captured', 
                `Photo ${capturedPhotos.length + 1} of ${REQUIRED_PHOTOS} captured successfully!`
            );
            
            setIsCapturing(false);
        }, 1000);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Face Enrollment Demo</Text>
                <Text style={styles.subtitle}>
                    Step {capturedPhotos.length + 1} of {REQUIRED_PHOTOS}
                </Text>
                
                <View style={styles.cameraPlaceholder}>
                    <Text style={styles.cameraText}>📷</Text>
                    <Text style={styles.cameraSubtext}>Camera View Placeholder</Text>
                </View>

                <View style={styles.statusContainer}>
                    <Text style={styles.photoCount}>
                        Photos captured: {capturedPhotos.length}/{REQUIRED_PHOTOS}
                    </Text>
                </View>

                {/* Photo thumbnails */}
                {capturedPhotos.length > 0 && (
                    <View style={styles.thumbnailContainer}>
                        <Text style={styles.thumbnailTitle}>Captured Photos:</Text>
                        <View style={styles.thumbnailRow}>
                            {capturedPhotos.map((uri, index) => (
                                <View key={index} style={styles.thumbnail}>
                                    <Text style={styles.thumbnailNumber}>{index + 1}</Text>
                                    <Text style={styles.thumbnailCheck}>✓</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Capture button - only show if not all photos captured */}
                {capturedPhotos.length < REQUIRED_PHOTOS && (
                    <TouchableOpacity
                        style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
                        disabled={isCapturing}
                        onPress={simulatePhotoCapture}
                    >
                        <Text style={styles.captureButtonText}>
                            {isCapturing ? 'Capturing...' : `Capture Photo ${capturedPhotos.length + 1}`}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Proceed button - only show when all photos captured */}
                {capturedPhotos.length >= REQUIRED_PHOTOS && (
                    <View style={styles.completionContainer}>
                        <Text style={styles.completionText}>
                            ✅ All photos captured successfully!
                        </Text>
                        
                        <TouchableOpacity
                            style={styles.proceedButton}
                            onPress={() => {
                                Alert.alert(
                                    'Face Enrollment Complete',
                                    `${REQUIRED_PHOTOS} photos captured successfully. Ready to proceed to next verification step.`,
                                    [
                                        {
                                            text: 'Continue',
                                            onPress: () => {
                                                console.log('Proceeding to next verification step...');
                                                console.log('Captured photos:', capturedPhotos);
                                                // TODO: Navigate to next screen
                                            }
                                        }
                                    ]
                                );
                            }}
                        >
                            <Text style={styles.proceedButtonText}>
                                Proceed to Next Step
                            </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                            style={styles.retakeButton}
                            onPress={() => {
                                Alert.alert(
                                    'Retake Photos',
                                    'Are you sure you want to retake all photos?',
                                    [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                            text: 'Retake',
                                            style: 'destructive',
                                            onPress: () => setCapturedPhotos([])
                                        }
                                    ]
                                );
                            }}
                        >
                            <Text style={styles.retakeButtonText}>
                                Retake All Photos
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    title: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10,
    },
    subtitle: {
        color: 'white',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
    },
    cameraPlaceholder: {
        flex: 1,
        backgroundColor: '#333',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    cameraText: {
        fontSize: 60,
        marginBottom: 10,
    },
    cameraSubtext: {
        color: 'white',
        fontSize: 16,
    },
    statusContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        padding: 15,
        borderRadius: 10,
        marginBottom: 20,
    },
    photoCount: {
        color: '#00FF00',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    thumbnailContainer: {
        marginBottom: 20,
    },
    thumbnailTitle: {
        color: 'white',
        fontSize: 14,
        marginBottom: 10,
        textAlign: 'center',
    },
    thumbnailRow: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    thumbnail: {
        width: 50,
        height: 50,
        backgroundColor: 'rgba(0, 255, 0, 0.8)',
        borderRadius: 25,
        marginHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
    thumbnailNumber: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    thumbnailCheck: {
        color: 'white',
        fontSize: 10,
        position: 'absolute',
        bottom: 2,
    },
    captureButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 25,
        alignSelf: 'center',
        marginBottom: 20,
    },
    captureButtonDisabled: {
        backgroundColor: 'rgba(0, 122, 255, 0.5)',
    },
    captureButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    completionContainer: {
        alignItems: 'center',
    },
    completionText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 20,
        backgroundColor: 'rgba(0, 255, 0, 0.2)',
        padding: 15,
        borderRadius: 10,
    },
    proceedButton: {
        backgroundColor: '#00FF00',
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 25,
        marginBottom: 10,
    },
    proceedButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    retakeButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'white',
    },
    retakeButtonText: {
        color: 'white',
        fontSize: 14,
    },
});