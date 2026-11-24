import { create } from 'zustand';

// src/stores/useLxLibraryStore.ts — shared entry for library, playlist import and settings.
export const useLxLibraryStore = create<{ isOpen: boolean; open: () => void; close: () => void }>(set => ({
    isOpen: false, open: () => set({ isOpen: true }), close: () => set({ isOpen: false }),
}));
