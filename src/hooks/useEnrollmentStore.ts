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
    setEmployee: (employee: Employee) => void;
    addImage: (uri: string) => void;
    addFingerprint: (data: FingerprintData) => void;
    setSkippedFingerprint: (skipped: boolean) => void;
    addDocument: (document: Document) => void;
    removeDocument: (id: string) => void;
    resetEnrollment: () => void;
}

export const useEnrollmentStore = create<EnrollmentState>((set) => ({
    employee: null,
    images: [],
    fingerprints: [],
    skippedFingerprint: false,
    documents: [],
    setEmployee: (employee) => set({ employee }),
    addImage: (uri) => set((state) => ({ images: [...state.images, uri] })),
    addFingerprint: (data) => set((state) => ({ fingerprints: [...state.fingerprints, data], skippedFingerprint: false })),
    setSkippedFingerprint: (skipped) => set({ skippedFingerprint: skipped }),
    addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
    removeDocument: (id) => set((state) => ({
        documents: state.documents.filter(d => d.id !== id)
    })),
    resetEnrollment: () => set({ employee: null, images: [], fingerprints: [], skippedFingerprint: false, documents: [] }),
}));
