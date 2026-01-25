import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';

import { useEnrollmentStore, Document } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';

const documentSchema = z.object({
    type: z.string().min(1, 'Document type is required'),
    otherLabel: z.string().optional(),
});

type DocumentForm = z.infer<typeof documentSchema>;

const DOCUMENT_TYPES = [
    { label: 'ID Card', value: 'ID_CARD', icon: 'card-outline' },
    { label: 'Appointment Letter', value: 'APPOINTMENT_LETTER', icon: 'document-text-outline' },
    { label: 'Offer Letter', value: 'OFFER_LETTER', icon: 'mail-outline' },
    { label: 'Promotion Letter', value: 'PROMOTION_LETTER', icon: 'trending-up-outline' },
    { label: 'Other', value: 'OTHER', icon: 'ellipsis-horizontal-outline' },
];

export default function DocumentUploadScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    
    // Use shallow selector
    const addDocument = useEnrollmentStore((state) => state.addDocument);
    const documents = useEnrollmentStore((state) => state.documents);
    const employee = useEnrollmentStore((state) => state.employee);
    
    const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<DocumentForm>({
        resolver: zodResolver(documentSchema),
        defaultValues: {
            type: '',
            otherLabel: '',
        }
    });

    const selectedType = watch('type');

    const handlePickImage = async (useCamera: boolean) => {
        const options = {
            mediaType: 'photo' as const,
            includeBase64: false,
            quality: 0.8 as const,
        };

        const result = useCamera ? await launchCamera(options) : await launchImageLibrary(options);

        if (result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            setSelectedFile({
                uri: asset.uri!,
                name: asset.fileName || `IMG_${Date.now()}.jpg`,
                type: asset.type || 'image/jpeg',
            });
        }
    };

    const handlePickDocument = async () => {
        try {
            const res = await DocumentPicker.pick({
                type: [DocumentPicker.types.pdf, DocumentPicker.types.images],
                copyTo: 'cachesDirectory',
            });
            const picked = res[0];
            setSelectedFile({
                uri: picked.fileCopyUri || picked.uri,
                name: picked.name || `DOC_${Date.now()}`,
                type: picked.type || 'application/octet-stream',
            });
        } catch (err) {
            if (!DocumentPicker.isCancel(err)) {
                console.error("Document Picker Error:", err);
                Alert.alert('Error', 'Failed to pick document: ' + (err instanceof Error ? err.message : String(err)));
            }
        }
    };

    const onSubmit = async (data: DocumentForm) => {
        if (!selectedFile) {
            Alert.alert('No document selected', 'Please capture or upload a document.');
            return;
        }

        setIsUploading(true);
        try {
            const newDoc: Document = {
                id: Math.random().toString(36).substring(7),
                type: data.type === 'OTHER' ? data.otherLabel || 'Other' : data.type,
                uri: selectedFile.uri,
                status: 'PENDING',
                uploadedBy: 'user-001', // Mock user
                createdAt: Date.now(),
            };

            addDocument(newDoc);
            Alert.alert('Success', 'Document added successfully');
            setSelectedFile(null);
            setValue('type', '');
            setValue('otherLabel', '');
        } catch (error) {
            Alert.alert('Error', 'Failed to save document');
        } finally {
            setIsUploading(false);
        }
    };

    const handleFinish = () => {
         navigation.navigate('Fingerprint');
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator currentStep={3} totalSteps={6} />

            <ScrollView contentContainerStyle={{ padding: 24 }}>
                <View className="items-center mb-6">
                    <View className="w-16 h-16 bg-primary/10 rounded-full items-center justify-center mb-4">
                        <Ionicons name="cloud-upload-outline" size={32} color="#10B981" />
                    </View>
                    <Text className="text-2xl font-bold text-primary mb-2 text-center">Document Upload</Text>
                    <Text className="text-base text-gray-500 text-center">
                        Upload required documents for {employee?.firstName}'s enrollment.
                    </Text>
                </View>

                {/* Upload Status / List */}
                {documents.length > 0 && (
                    <Card className="p-4 mb-6 border-primary/20 bg-primary/5">
                        <Text className="text-sm font-semibold text-primary mb-3">Uploaded Documents ({documents.length})</Text>
                        {documents.map((doc, index) => (
                            <View key={doc.id} className="flex-row items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                <View className="flex-row items-center flex-1">
                                    <Ionicons name="checkmark-circle" size={20} color="#10B981" className="mr-2" />
                                    <Text className="text-sm text-gray-700 font-medium" numberOfLines={1}>
                                        {doc.type.replace(/_/g, ' ')}
                                    </Text>
                                </View>
                                <Text className="text-[10px] text-gray-400">
                                    {new Date(doc.createdAt).toLocaleDateString()}
                                </Text>
                            </View>
                        ))}
                    </Card>
                )}

                <Card className="p-6 mb-6">
                    <Text className="text-sm font-medium text-gray-700 mb-3">Select Document Type</Text>
                    <View className="flex-row flex-wrap gap-2 mb-4">
                        {DOCUMENT_TYPES.map((type) => (
                            <TouchableOpacity
                                key={type.value}
                                onPress={() => setValue('type', type.value)}
                                className={`
                                    flex-row items-center px-4 py-2.5 rounded-full border
                                    ${selectedType === type.value
                                        ? 'bg-primary border-primary'
                                        : 'bg-white border-gray-200'}
                                `}
                            >
                                <Ionicons
                                    name={type.icon as any}
                                    size={18}
                                    color={selectedType === type.value ? 'white' : '#6B7280'}
                                />
                                <Text className={`ml-2 text-sm font-medium ${selectedType === type.value ? 'text-white' : 'text-gray-600'}`}>
                                    {type.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {selectedType === 'OTHER' && (
                        <Input
                            label="Document Label"
                            name="otherLabel"
                            control={control}
                            placeholder="e.g. Birth Certificate"
                            error={errors.otherLabel?.message}
                        />
                    )}

                    {!selectedFile ? (
                        <View className="mb-4">
                            <Text className="text-sm font-medium text-gray-700 mb-3">Pick Document Source</Text>
                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    onPress={() => handlePickImage(true)}
                                    className="flex-1 items-center justify-center py-4 bg-gray-50 rounded-2xl border border-gray-100 border-dashed"
                                >
                                    <Ionicons name="camera-outline" size={24} color="#6B7280" />
                                    <Text className="text-xs text-gray-500 mt-1">Camera</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handlePickImage(false)}
                                    className="flex-1 items-center justify-center py-4 bg-gray-50 rounded-2xl border border-gray-100 border-dashed"
                                >
                                    <Ionicons name="images-outline" size={24} color="#6B7280" />
                                    <Text className="text-xs text-gray-500 mt-1">Gallery</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handlePickDocument}
                                    className="flex-1 items-center justify-center py-4 bg-gray-50 rounded-2xl border border-gray-100 border-dashed"
                                >
                                    <Ionicons name="document-outline" size={24} color="#6B7280" />
                                    <Text className="text-xs text-gray-500 mt-1">Files (PDF)</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View className="mb-6">
                            <Text className="text-sm font-medium text-gray-700 mb-3">Preview</Text>
                            <View className="w-full h-48 bg-gray-100 rounded-2xl overflow-hidden items-center justify-center relative">
                                {selectedFile.type.startsWith('image/') ? (
                                    <Image source={{ uri: selectedFile.uri }} className="w-full h-full" resizeMode="cover" />
                                ) : (
                                    <View className="items-center">
                                        <Ionicons name="document-text" size={64} color="#9CA3AF" />
                                        <Text className="text-gray-500 mt-2 font-medium">{selectedFile.name}</Text>
                                    </View>
                                )}
                                <TouchableOpacity
                                    onPress={() => setSelectedFile(null)}
                                    className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full items-center justify-center"
                                >
                                    <Ionicons name="close" size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <Button
                        title="Add Document"
                        onPress={handleSubmit(onSubmit)}
                        loading={isUploading}
                        disabled={!selectedFile || !selectedType}
                        variant="tonal"
                    />
                </Card>

                <Button
                    title={documents.length > 0 ? "Proceed to Next Step" : "Skip Document Upload"}
                    onPress={handleFinish}
                    variant={documents.length > 0 ? "filled" : "outlined"}
                    className="mt-2"
                />

                <Button
                    title="Back"
                    onPress={() => navigation.goBack()}
                    variant="text"
                    className="mt-2"
                />
            </ScrollView>
        </SafeAreaView>
    );
}
