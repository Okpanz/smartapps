import { create } from 'zustand';
import { Employee } from '../services/verification';

interface EnrollmentState {
    employee: Employee | null;
    images: string[];       // Store image URIs
    setEmployee: (employee: Employee) => void;
    addImage: (uri: string) => void;
    resetEnrollment: () => void;
}

export const useEnrollmentStore = create<EnrollmentState>((set) => ({
    employee: null,
    images: [],
    setEmployee: (employee) => set({ employee }),
    addImage: (uri) => set((state) => ({ images: [...state.images, uri] })),
    resetEnrollment: () => set({ employee: null, images: [] }),
}));
