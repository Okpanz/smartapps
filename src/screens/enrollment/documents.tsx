import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DocumentScanner from 'react-native-document-scanner-plugin';

import { useEnrollmentStore, Document } from '../../hooks/useEnrollmentStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { EnhancedStepIndicator } from '../../components/ui/EnhancedStepIndicator';
import { CustomAlert, AlertType } from '../../components/ui/CustomAlert';
import { Skeleton } from '../../components/ui/Skeleton';
import { isSmallDevice } from '../../utils/responsive';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import api from '../../services/api';
import { useAuthStore } from '@/hooks/useAuthStore';

const documentSchema = z.object({
    type: z.string().min(1, 'Document type is required'),
    otherLabel: z.string().optional(),
});

type DocumentForm = z.infer<typeof documentSchema>;

interface DocumentType {
    type: string;
    label: string;
    icon?: string;
    isActive: boolean;
    isForAllServices?: boolean;
    visibleToServices?: number[];
}

export default function DocumentUploadScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const resumeFlow = route.params?.resumeFlow === true;
    const { get, fetchForCurrentService } = useFeatureFlags();
    
    // Use shallow selector
    const addDocument = useEnrollmentStore((state) => state.addDocument);
    const removeDocument = useEnrollmentStore((state) => state.removeDocument);
    const documents = useEnrollmentStore((state) => state.documents);
    const employee = useEnrollmentStore((state) => state.employee);
    
    const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
    const [isLoadingTypes, setIsLoadingTypes] = useState(false);

    const fetchDocumentTypes = async () => {
        try {
            setIsLoadingTypes(true);
            const user = useAuthStore.getState().user;
            const params: any = {};
            if (user?.service_id) {
                params.serviceId = user.service_id;
            }
            const response = await api.get('/document-types', { params });
            console.log('Document types:', response.data);
            const types = response.data?.data || response.data;
            setDocumentTypes(types.filter((t: DocumentType) => t.isActive));
        } catch (error) {
            console.error('Failed to fetch document types:', error);
            setDocumentTypes([
                { type: 'FIRST_APPOINTMENT_LETTER', label: 'First Appointment Letter', icon: 'document-text-outline', isActive: true },
                { type: 'CONFIRMATION_LETTER', label: 'Confirmation Letter', icon: 'mail-outline', isActive: true },
                { type: 'BVN', label: 'BVN', icon: 'mail-outline', isActive: true },
                { type: 'LAST_PROMOTION_LETTER', label: 'Last Promotion Letter', icon: 'trending-up-outline', isActive: true },
                { type: 'BIRTH_CERTIFICATE', label: 'Birth Cert', icon: 'trending-up-outline', isActive: true },
                { type: 'HIGHEST_ACADEMIC_QUALIFICATION', label: 'Highest Academic Qualification', icon: 'card-outline', isActive: true }
            ]);
        } finally {
            setIsLoadingTypes(false);
        }
    };

    useEffect(() => { 
        fetchForCurrentService(); 
        fetchDocumentTypes();
    }, []);
    
    const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: AlertType;
        onConfirm?: () => void;
    }>({
        visible: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showAlert = (title: string, message: string, type: AlertType = 'info', onConfirm?: () => void) => {
        setAlertConfig({ visible: true, title, message, type, onConfirm });
    };

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<DocumentForm>({
        resolver: zodResolver(documentSchema),
        defaultValues: {
            type: '',
            otherLabel: '',
        }
    });

    const selectedType = watch('type');

    const handleScanDocument = async () => {
        try {
            const { scannedImages } = await DocumentScanner.scanDocument({
                maxNumDocuments: 1
            });

            if (scannedImages && scannedImages.length > 0) {
                const scannedImageUri = scannedImages[0];
                setSelectedFile({
                    uri: scannedImageUri,
                    name: `SCAN_${Date.now()}.jpg`,
                    type: 'image/jpeg',
                });
            }
        } catch (err) {
            console.error("Scanner Error:", err);
            showAlert('Error', 'Failed to scan document: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }
    };

    const onSubmit = async (data: DocumentForm) => {
        if (!selectedFile) {
            showAlert('No document selected', 'Please capture or upload a document.', 'warning');
            return;
        }

        setIsUploading(true);
        try {
            const documentType = data.type === 'OTHER' ? data.otherLabel || 'Other' : data.type;
            
            // Check if document of this type already exists and remove it first
            const existingDoc = documents.find(doc => doc.type === documentType);
            if (existingDoc) {
                removeDocument(existingDoc.id);
            }
            
            const newDoc: Document = {
                id: Math.random().toString(36).substring(7),
                type: documentType,
                uri: selectedFile.uri,
                status: 'PENDING',
                uploadedBy: 'user-001', // Mock user
                createdAt: Date.now(),
            };

            addDocument(newDoc);
            showAlert('Success', existingDoc ? 'Document replaced successfully' : 'Document added successfully', 'success');
            setSelectedFile(null);
            setValue('type', '');
            setValue('otherLabel', '');
        } catch (error) {
            showAlert('Error', 'Failed to save document', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleFinish = () => {
         if (get('fingerprint_capture_enabled', true)) {
             navigation.navigate('Fingerprint', { resumeFlow: resumeFlow });
         } else {
             navigation.navigate('Face', { resumeFlow: resumeFlow });
         }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <EnhancedStepIndicator 
                currentStep={resumeFlow ? 2 : 3} 
                totalSteps={resumeFlow ? 5 : 6} 
                stepLabels={resumeFlow ? ['Confirm', 'Documents', 'Prints', 'Face', 'Complete'] : ['Identify', 'Details', 'Upload', 'Prints', 'Face', 'Confirm']}
            />

            <ScrollView contentContainerStyle={{ padding: isSmallDevice ? 16 : 24, paddingBottom: 40 }}>
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
                    <Card className={isSmallDevice ? "p-4 mb-4 border-primary/20 bg-primary/5" : "p-4 mb-6 border-primary/20 bg-primary/5"}>
                        <Text className="text-sm font-semibold text-primary mb-3">Uploaded Documents ({documents.length})</Text>
                        {documents.map((doc, index) => (
                            <View key={doc.id} className="flex-row items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                <View className="flex-row items-center flex-1">
                                    <Ionicons name="checkmark-circle" size={20} color="#10B981" className="mr-2" />
                                    <Text className="text-sm text-gray-700 font-medium" numberOfLines={1}>
                                        {doc.type.replace(/_/g, ' ')}
                                    </Text>
                                </View>
                                <View className="flex-row items-center">
                                    <Text className="text-[10px] text-gray-400 mr-3">
                                        {new Date(doc.createdAt).toLocaleDateString()}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => removeDocument(doc.id)}
                                        className="px-2 py-1 rounded-lg bg-red-50 border border-red-200"
                                    >
                                        <Text className="text-[10px] font-semibold text-red-600">Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </Card>
                )}

                <Card className={isSmallDevice ? "p-4 mb-6" : "p-6 mb-6"}>
                    <Text className="text-sm font-medium text-gray-700 mb-3">Select Document Type</Text>
                    <View className="flex-row flex-wrap gap-2 mb-4">
                        {isLoadingTypes ? (
                            Array.from({ length: 5 }).map((_, index) => (
                                <Skeleton
                                    key={index}
                                    width={120 + Math.random() * 40}
                                    height={36}
                                    borderRadius={18}
                                    className="mr-2 mb-2"
                                />
                            ))
                        ) : (
                            documentTypes.map((type) => {
                                const isUploaded = documents.some(doc => doc.type === type.type);
                                return (
                                    <TouchableOpacity
                                        key={type.type}
                                        onPress={() => setValue('type', type.type)}
                                        className={`
                                            flex-row items-center px-4 py-2.5 rounded-full border
                                            ${selectedType === type.type
                                                ? 'bg-primary border-primary'
                                                : isUploaded
                                                    ? 'bg-orange-50 border-orange-200'
                                                    : 'bg-white border-gray-200'}
                                        `}
                                    >
                                        <Ionicons
                                            name={selectedType === type.type 
                                                ? 'checkmark-circle' 
                                                : isUploaded 
                                                    ? 'refresh-circle-outline' 
                                                    : (type.icon as any) || 'document-text-outline'}
                                            size={18}
                                            color={selectedType === type.type ? 'white' : isUploaded ? '#F97316' : '#6B7280'}
                                        />
                                        <Text className={`ml-2 text-sm font-medium ${selectedType === type.type ? 'text-white' : isUploaded ? 'text-gray-400' : 'text-gray-600'}`}>
                                            {type.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })
                        )}
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
                            <Text className="text-sm font-medium text-gray-700 mb-3">Scan Document</Text>
                            <TouchableOpacity
                                onPress={handleScanDocument}
                                className="w-full items-center justify-center py-8 bg-gray-50 rounded-2xl border border-gray-200 border-dashed active:bg-gray-100"
                            >
                                <View className="w-16 h-16 bg-white rounded-full items-center justify-center mb-3 shadow-sm border border-gray-100">
                                    <Ionicons name="scan-outline" size={32} color="#4F46E5" />
                                </View>
                                <Text className="text-base font-medium text-gray-900">Tap to Scan Document</Text>
                                <Text className="text-sm text-gray-500 mt-1">Camera will open to scan</Text>
                            </TouchableOpacity>
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

                <CustomAlert
                    visible={alertConfig.visible}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    type={alertConfig.type}
                    onClose={hideAlert}
                    onConfirm={alertConfig.onConfirm}
                />
            </ScrollView>
        </SafeAreaView>
    );
}
