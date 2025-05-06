// src/store/useImageSelectionStore.ts
import { create } from 'zustand';

interface ImageSelectionState {
  // --- Changed to Array ---
  selectedImageKeys: string[];
  // --- End Change ---

  // Flag to indicate if the picker sheet should be open
  shouldOpenPickerSheet: boolean;

  // Actions
  toggleImageSelection: (key: string) => void;
  setSelectedImageKeys: (keys: string[]) => void; // To initialize from outside
  clearSelection: () => void; // To reset the state
  // Action to control the visibility flag
  setShouldOpenPickerSheet: (open: boolean) => void;
}

const useImageSelectionStore = create<ImageSelectionState>((set) => ({
  // --- Initial state changed to empty array ---
  selectedImageKeys: [],
  // --- End Change ---

  shouldOpenPickerSheet: false, // Initial visibility flag state

  // --- Updated toggleImageSelection for immutable array updates ---
  toggleImageSelection: (key) =>
    set((state) => {
      const currentKeys = state.selectedImageKeys; // Get current array

      if (currentKeys.includes(key)) {
        // If key exists, create a *new* array excluding the key
        const nextKeys = currentKeys.filter((k) => k !== key);
        // Return a *new* state object with the *new* array
        return { selectedImageKeys: nextKeys };
      } else {
        // If key doesn't exist, create a *new* array including the key
        const nextKeys = [...currentKeys, key]; // Use spread to create a new array
        // Return a *new* state object with the *new* array
        return { selectedImageKeys: nextKeys };
      }
      // Note: No need for an 'else' on the outer level because we return inside the if/else
    }),
  // --- End Update ---

  // --- setSelectedImageKeys is mostly fine, ensures 'keys' is set directly ---
  setSelectedImageKeys: (keys) => set({ selectedImageKeys: keys }),
  // --- End Update ---

  // --- clearSelection updated for array ---
  clearSelection: () => set({ selectedImageKeys: [] }),
  // --- End Update ---

  setShouldOpenPickerSheet: (open) => set({ shouldOpenPickerSheet: open }),
}));

export default useImageSelectionStore;
