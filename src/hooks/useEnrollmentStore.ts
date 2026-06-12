import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  images: string[];
  fingerprints: FingerprintData[];
  skippedFingerprint: boolean;
  documents: Document[];
  dob?: string | null;
  firstAppointmentDate?: string | null;
  nin?: string | null;
  bvn?: string | null;

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
  setBvn: (bvn: string | null) => void;
  resetEnrollment: () => void;
}

const initialState = {
  employee: null,
  images: [],
  fingerprints: [],
  skippedFingerprint: false,
  documents: [],
  dob: null,
  firstAppointmentDate: null,
  nin: null,
  bvn: null,
};

// Persisted so that an OS-killed mid-enrollment session can be recovered.
// Only URIs and metadata are stored — no binary data.
// The Identifier screen should check for a non-empty draft on mount and
// offer the agent a "Resume draft" prompt before starting a new enrollment.
export const useEnrollmentStore = create<EnrollmentState>()(
  persist(
    (set) => ({
      ...initialState,

      setEmployee: (employee) => set({ employee }),
      setImages: (images) => set({ images }),
      addImage: (uri) => set((s) => ({ images: [...s.images, uri] })),
      removeImage: (uri) => set((s) => ({ images: s.images.filter((i) => i !== uri) })),
      setFingerprints: (fingerprints) => set({ fingerprints }),
      addFingerprint: (data) =>
        set((s) => ({ fingerprints: [...s.fingerprints, data], skippedFingerprint: false })),
      setSkippedFingerprint: (skipped) => set({ skippedFingerprint: skipped }),
      addDocument: (document) => set((s) => ({ documents: [...s.documents, document] })),
      setDocuments: (documents) => set({ documents }),
      removeDocument: (id) =>
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
      setDob: (dob) => set({ dob }),
      setFirstAppointmentDate: (firstAppointmentDate) => set({ firstAppointmentDate }),
      setNin: (nin) => set({ nin }),
      setBvn: (bvn) => set({ bvn }),
      resetEnrollment: () => set(initialState),
    }),
    {
      name: 'enrollment-draft',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data fields — exclude all action functions
      partialize: (state) => ({
        employee: state.employee,
        images: state.images,
        fingerprints: state.fingerprints,
        skippedFingerprint: state.skippedFingerprint,
        documents: state.documents,
        dob: state.dob,
        firstAppointmentDate: state.firstAppointmentDate,
        nin: state.nin,
        bvn: state.bvn,
      }),
    }
  )
);
