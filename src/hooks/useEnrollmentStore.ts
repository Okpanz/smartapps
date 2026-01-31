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

interface EnrollmentState {
    employee: Employee | null;
    images: string[];       // Store image URIs
    fingerprints: string[]; // Store fingerprint data
    documents: Document[];
    setEmployee: (employee: Employee) => void;
    addImage: (uri: string) => void;
    addFingerprint: (data: string) => void;
    addDocument: (document: Document) => void;
    removeDocument: (id: string) => void;
    resetEnrollment: () => void;
}

export const useEnrollmentStore = create<EnrollmentState>((set) => ({
    employee: null,
    images: [],
    fingerprints: [],
    documents: [],
    setEmployee: (employee) => set({ employee }),
    addImage: (uri) => set((state) => ({ images: [...state.images, uri] })),
    addFingerprint: (data) => set((state) => ({ fingerprints: [...state.fingerprints, data] })),
    addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
    removeDocument: (id) => set((state) => ({
        documents: state.documents.filter(d => d.id !== id)
    })),
    resetEnrollment: () => set({ employee: null, images: [], fingerprints: [], documents: [] }),
}));
