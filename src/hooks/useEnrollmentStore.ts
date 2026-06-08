import { create } from 'zustand';
import { Employee } from '../services/verification';

export interface Document {
    id: string;
    type: string;
    uri: string;
    status: 'PENDING' | 'SYNCED' | 'FAILED' | 'VERIFIED';
    uploadedBy: string;
    createdAt: number;
}

export interface FingerprintData {
    uri: string;
    type: 'Left Thumb' | 'Right Thumb';
}

interface EnrollmentState {
    employee: Employee | null;
    images: string[];       // Store image URIs
    fingerprints: FingerprintData[]; // Store fingerprint data
    skippedFingerprint: boolean;
    documents: Document[];
    dob?: string | null;
    firstAppointmentDate?: string | null;
    nin?: string | null;
    setEmployee: (employee: Employee) => void;
    setImages: (images: string[]) => void;
    addImage: (uri: string) => void;
    removeImage: (uri: string) => void;
    setFingerprints: (data: FingerprintData[]) => void;
    addFingerprint: (data: FingerprintData) => void;
    setSkippedFingerprint: (skipped: boolean) => void;
    addDocument: (document: Document) => void;
    setDocuments: (documents: Document[]) => void;
    removeDocument: (id: string) => void;
    setDob: (dob: string | null) => void;
    setFirstAppointmentDate: (date: string | null) => void;
    setNin: (nin: string | null) => void;
    resetEnrollment: () => void;
}



export const useEnrollmentStore = create<EnrollmentState>((set) => ({
    employee: null,
    images: [],
    fingerprints: [],
    skippedFingerprint: false,
    documents: [],
    dob: null,
    firstAppointmentDate: null,
    nin: null,
    setEmployee: (employee) => set({ employee }),
    setImages: (images) => set({ images }),
    addImage: (uri) => set((state) => ({ images: [...state.images, uri] })),
    removeImage: (uri) => set((state) => ({ images: state.images.filter(i => i !== uri) })),
    setFingerprints: (data) => set({ fingerprints: data }),
    addFingerprint: (data) => set((state) => ({ fingerprints: [...state.fingerprints, data], skippedFingerprint: false })),
    setSkippedFingerprint: (skipped) => set({ skippedFingerprint: skipped }),
    addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
    setDocuments: (documents) => set({ documents }),
    removeDocument: (id) => set((state) => ({
        documents: state.documents.filter(d => d.id !== id)
    })),
    setDob: (dob) => set({ dob }),
    setFirstAppointmentDate: (date) => set({ firstAppointmentDate: date }),
    setNin: (nin) => set({ nin }),
    resetEnrollment: () => set({ employee: null, images: [], fingerprints: [], skippedFingerprint: false, documents: [], dob: null, firstAppointmentDate: null, nin: null }),
}));
