import { create } from 'zustand';
import { Employee } from '../services/verification';

interface EnrollmentState {
    employee: Employee | null;
    images: string[];       // Store image URIs
    fingerprints: string[]; // Store fingerprint data
    setEmployee: (employee: Employee) => void;
    addImage: (uri: string) => void;
    addFingerprint: (data: string) => void;
    resetEnrollment: () => void;
}

export const useEnrollmentStore = create<EnrollmentState>((set) => ({
    employee: null,
    images: [],
    fingerprints: [],
    setEmployee: (employee) => set({ employee }),
    addImage: (uri) => set((state) => ({ images: [...state.images, uri] })),
    addFingerprint: (data) => set((state) => ({ fingerprints: [...state.fingerprints, data] })),
    resetEnrollment: () => set({ employee: null, images: [], fingerprints: [] }),
}));
