import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { MMKVLoader } from 'react-native-mmkv-storage'; // Using MMKV for better performance on RN

// Ensure these imports are correct based on your project structure
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import { CivitaiModelVersionWithFilesAndImages } from '~/backend/schema/modelVersions';
import { ASPECT_RATIOS } from '~/constants/generation'; // Assuming this path is correct

// Define the structure for a selected model and its chosen version
interface SelectedModelAndVersion {
  model: CivitaiModelWithRelations;
  version: CivitaiModelVersionWithFilesAndImages;
}

// Helper to get the first viewable file's runpodPath or null
const getDefaultVersion = (
  model: CivitaiModelWithRelations
): CivitaiModelVersionWithFilesAndImages | undefined => {
  // Filter versions to find one with viewable files (assuming runpodPath indicates viewability)
  // Or you might have a specific flag like `canGenerate` on the version
  // For now, let's just take the first version available as per original logic
  // Refinement: Maybe filter by version file type if needed, but often the first version is the main one
  return model.modelVersions?.[0]; // Returns the first version or undefined
};

// Helper to find a specific version by ID within a model
const findVersionById = (
  model: CivitaiModelWithRelations,
  versionId: number
): CivitaiModelVersionWithFilesAndImages | undefined => {
  return model.modelVersions?.find((v) => v.id === versionId);
};

interface GenerationState {
  // Parameters
  prompt: string;
  negativePrompt: string;
  width: string; // Store as string from Input
  height: string; // Store as string from Input
  numImages: string; // Store as string from Input
  seed: string; // Store as string from Input field
  useRandomSeed: boolean; // Checkbox state

  // Selections - NOW STORING { model, version }
  selectedCheckpoint: SelectedModelAndVersion | null;
  selectedLoras: SelectedModelAndVersion[]; // Array of { model, version }
  selectedTextualInversions: SelectedModelAndVersion[]; // Array of { model, version }
  selectedHypernetworks: SelectedModelAndVersion[];
  selectedAestheticGradients: SelectedModelAndVersion[];
  selectedControlnets: SelectedModelAndVersion[];
  selectedPose: SelectedModelAndVersion | null;

  // UI State (can be persisted or not)
  selectedAspectRatio: string | 'custom';
  useCustomRatio: boolean;
}

interface GenerationActions {
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (negativePrompt: string) => void;
  setWidth: (width: string) => void;
  setHeight: (height: string) => void;
  setNumImages: (numImages: string) => void;
  setSeed: (seed: string) => void;
  setUseRandomSeed: (useRandomSeed: boolean) => void;

  // Actions for selecting/adding models - take the full model, and optionally a specific version ID
  setSelectedCheckpoint: (model: CivitaiModelWithRelations | null, versionId?: number) => void;
  addOrRemoveLora: (model: CivitaiModelWithRelations, versionId?: number) => void; // Takes model, optionally version ID
  addOrRemoveTextualInversion: (model: CivitaiModelWithRelations, versionId?: number) => void;
  addOrRemoveHypernetwork: (model: CivitaiModelWithRelations, versionId?: number) => void;
  addOrRemoveAestheticGradient: (model: CivitaiModelWithRelations, versionId?: number) => void;
  addOrRemoveControlnet: (model: CivitaiModelWithRelations, versionId?: number) => void;
  setSelectedPose: (model: CivitaiModelWithRelations | null, versionId?: number) => void; // Pose is single select

  // Actions to CHANGE the version of an *already selected* model
  updateCheckpointVersion: (versionId: number) => void; // Only possible if a checkpoint is already selected
  updateLoraVersion: (modelId: number, versionId: number) => void;
  updateTextualInversionVersion: (modelId: number, versionId: number) => void;
  updateHypernetworkVersion: (modelId: number, versionId: number) => void;
  updateAestheticGradientVersion: (modelId: number, versionId: number) => void;
  updateControlnetVersion: (modelId: number, versionId: number) => void;
  updatePoseVersion: (versionId: number) => void; // Only possible if a pose is already selected

  // Actions for UI state
  setSelectedAspectRatio: (ratio: string | 'custom') => void;
  setUseCustomRatio: (useCustom: boolean) => void;

  // Action to load state from navigation params
  // This will need to look up models and versions based on IDs in params
  loadFromParams: (
    params: any, // params might include modelIds and versionIds
    // modelsData is required here to find the full model and version objects
    modelsData: {
      checkpoints?: CivitaiModelWithRelations[] | null;
      loras?: CivitaiModelWithRelations[] | null;
      textualInversions?: CivitaiModelWithRelations[] | null;
      hypernetworks?: CivitaiModelWithRelations[] | null;
      aestheticGradients?: CivitaiModelWithRelations[] | null;
      controlnets?: CivitaiModelWithRelations[] | null;
      poses?: CivitaiModelWithRelations[] | null;
    }
  ) => void;

  // Action to reset state (optional)
  resetState: () => void;
}

// Use MMKV for storage
// const storage = new MMKVLoader().initialize();

// const zustandStorage: StateStorage = {
//   setItem: storage.setItem,
//   getItem: (name) => {
//     // MMKV getString returns undefined if not found, needs to be null for persist
//     return storage.getString(name) ?? null;
//   },
//   removeItem(name) {
//     return storage.removeItem(name);
//   },
// };

// Helper to find a model by ID in a list
const findModelById = (
  models: CivitaiModelWithRelations[] | undefined | null,
  modelId: number | string
) => {
  if (!models) return undefined;
  return models.find((m) => m.id.toString() === String(modelId));
};

const useGenerationStore = create<GenerationState & GenerationActions>()(
  (set, get) => ({
    // Initial State
    prompt: '',
    negativePrompt: '',
    width: '512',
    height: '512',
    numImages: '1',
    seed: '',
    useRandomSeed: true,

    selectedCheckpoint: null,
    selectedLoras: [],
    selectedTextualInversions: [],
    selectedHypernetworks: [],
    selectedAestheticGradients: [],
    selectedControlnets: [],
    selectedPose: null,

    selectedAspectRatio: '512*512',
    useCustomRatio: false,

    // Actions Implementation

    setPrompt: (prompt) => set({ prompt }),
    setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
    setWidth: (width) => set({ width }),
    setHeight: (height) => set({ height }),
    setNumImages: (numImages) => set({ numImages }),
    setSeed: (seed) => set({ seed }),
    setUseRandomSeed: (useRandomSeed) => set({ useRandomSeed }),

    // --- Selection/Add Actions (Handles initial selection/addition) ---

    setSelectedCheckpoint: (model, versionId) => {
      if (!model) {
        set({ selectedCheckpoint: null });
        return;
      }

      let version =
        versionId !== undefined
          ? findVersionById(model, versionId) // Try finding specific version
          : getDefaultVersion(model); // Fallback to default

      if (!version) {
        console.warn(
          `Checkpoint ${model.name} (ID: ${model.id}) has no viewable files or specified version (ID: ${versionId}) not found.`
        );
        set({ selectedCheckpoint: null }); // Clear if no valid version found
        return;
      }

      set({
        selectedCheckpoint: { model, version },
      });
    },

    addOrRemoveLora: (model, versionId) => {
      const currentLoras = get().selectedLoras;
      const existsIndex = currentLoras.findIndex((item) => item.model.id === model.id);

      if (existsIndex !== -1) {
        // Model already exists, remove it
        set({
          selectedLoras: currentLoras.filter((_, index) => index !== existsIndex),
        });
      } else {
        // Model does not exist, add it
        if (currentLoras.length >= 6) {
          // Optional: Display a user-friendly message outside the store action
          console.warn('Max 6 LoRAs allowed.');
          return;
        }

        let version =
          versionId !== undefined
            ? findVersionById(model, versionId) // Try finding specific version
            : getDefaultVersion(model); // Fallback to default

        if (!version) {
          console.warn(
            `LoRA ${model.name} (ID: ${model.id}) has no viewable files or specified version (ID: ${versionId}) not found.`
          );
          return; // Don't add if no valid version found
        }

        set({
          selectedLoras: [...currentLoras, { model, version }],
        });
      }
    },

    addOrRemoveTextualInversion: (model, versionId) => {
      const currentTIs = get().selectedTextualInversions;
      const existsIndex = currentTIs.findIndex((item) => item.model.id === model.id);

      if (existsIndex !== -1) {
        set({
          selectedTextualInversions: currentTIs.filter((_, index) => index !== existsIndex),
        });
      } else {
        let version =
          versionId !== undefined ? findVersionById(model, versionId) : getDefaultVersion(model);

        if (!version) {
          console.warn(
            `Textual Inversion ${model.name} (ID: ${model.id}) has no viewable files or specified version (ID: ${versionId}) not found.`
          );
          return;
        }
        set({
          selectedTextualInversions: [...currentTIs, { model, version }],
        });
      }
    },

    addOrRemoveHypernetwork: (model, versionId) => {
      const currentHN = get().selectedHypernetworks;
      const existsIndex = currentHN.findIndex((item) => item.model.id === model.id);

      if (existsIndex !== -1) {
        set({
          selectedHypernetworks: currentHN.filter((_, index) => index !== existsIndex),
        });
      } else {
        let version =
          versionId !== undefined ? findVersionById(model, versionId) : getDefaultVersion(model);

        if (!version) {
          console.warn(
            `Hypernetwork ${model.name} (ID: ${model.id}) has no viewable files or specified version (ID: ${versionId}) not found.`
          );
          return;
        }
        set({
          selectedHypernetworks: [...currentHN, { model, version }],
        });
      }
    },

    addOrRemoveAestheticGradient: (model, versionId) => {
      const currentAG = get().selectedAestheticGradients;
      const existsIndex = currentAG.findIndex((item) => item.model.id === model.id);

      if (existsIndex !== -1) {
        set({
          selectedAestheticGradients: currentAG.filter((_, index) => index !== existsIndex),
        });
      } else {
        let version =
          versionId !== undefined ? findVersionById(model, versionId) : getDefaultVersion(model);

        if (!version) {
          console.warn(
            `Aesthetic Gradient ${model.name} (ID: ${model.id}) has no viewable files or specified version (ID: ${versionId}) not found.`
          );
          return;
        }
        set({
          selectedAestheticGradients: [...currentAG, { model, version }],
        });
      }
    },

    addOrRemoveControlnet: (model, versionId) => {
      const currentCN = get().selectedControlnets;
      const existsIndex = currentCN.findIndex((item) => item.model.id === model.id);

      if (existsIndex !== -1) {
        set({
          selectedControlnets: currentCN.filter((_, index) => index !== existsIndex),
        });
      } else {
        let version =
          versionId !== undefined ? findVersionById(model, versionId) : getDefaultVersion(model);

        if (!version) {
          console.warn(
            `Controlnet ${model.name} (ID: ${model.id}) has no viewable files or specified version (ID: ${versionId}) not found.`
          );
          return;
        }
        set({
          selectedControlnets: [...currentCN, { model, version }],
        });
      }
    },

    setSelectedPose: (model, versionId) => {
      if (!model) {
        set({ selectedPose: null });
        return;
      }

      let version =
        versionId !== undefined ? findVersionById(model, versionId) : getDefaultVersion(model);

      if (!version) {
        console.warn(
          `Pose model ${model.name} (ID: ${model.id}) has no viewable files or specified version (ID: ${versionId}) not found.`
        );
        set({ selectedPose: null }); // Clear if no valid version found
        return;
      }
      set({
        selectedPose: { model, version },
      });
    },

    // --- Update Version Actions (Handles changing version of already selected models) ---
    // These are crucial for your dropdown UI on cards

    updateCheckpointVersion: (versionId) => {
      const currentCheckpoint = get().selectedCheckpoint;
      if (!currentCheckpoint) {
        console.warn('Cannot update checkpoint version: No checkpoint is currently selected.');
        return;
      }
      const model = currentCheckpoint.model;
      const newVersion = findVersionById(model, versionId);

      if (!newVersion) {
        console.warn(
          `Cannot update checkpoint version for model ${model.name} (ID: ${model.id}): Version with ID ${versionId} not found.`
        );
        return;
      }

      // Update the selectedCheckpoint object with the new version
      set({
        selectedCheckpoint: { model: model, version: newVersion },
      });
    },

    updateLoraVersion: (modelId, versionId) => {
      const currentLoras = get().selectedLoras;
      const updatedLoras = currentLoras.map((item) => {
        if (item.model.id === modelId) {
          const newVersion = findVersionById(item.model, versionId);
          if (newVersion) {
            // Return a *new* object with the updated version
            return { ...item, version: newVersion };
          } else {
            console.warn(
              `Cannot update LoRA version for model ID ${modelId}: Version ID ${versionId} not found.`
            );
            // Keep the old item if the new version isn't found
            return item;
          }
        }
        return item; // Keep other items as they are
      });
      // Only update state if any item potentially changed (though map creates a new array anyway)
      set({ selectedLoras: updatedLoras });
    },

    updateTextualInversionVersion: (modelId, versionId) => {
      const currentTIs = get().selectedTextualInversions;
      const updatedTIs = currentTIs.map((item) => {
        if (item.model.id === modelId) {
          const newVersion = findVersionById(item.model, versionId);
          if (newVersion) {
            return { ...item, version: newVersion };
          } else {
            console.warn(
              `Cannot update Textual Inversion version for model ID ${modelId}: Version ID ${versionId} not found.`
            );
            return item;
          }
        }
        return item;
      });
      set({ selectedTextualInversions: updatedTIs });
    },

    updateHypernetworkVersion: (modelId, versionId) => {
      const currentHN = get().selectedHypernetworks;
      const updatedHN = currentHN.map((item) => {
        if (item.model.id === modelId) {
          const newVersion = findVersionById(item.model, versionId);
          if (newVersion) {
            return { ...item, version: newVersion };
          } else {
            console.warn(
              `Cannot update Hypernetwork version for model ID ${modelId}: Version ID ${versionId} not found.`
            );
            return item;
          }
        }
        return item;
      });
      set({ selectedHypernetworks: updatedHN });
    },

    updateAestheticGradientVersion: (modelId, versionId) => {
      const currentAG = get().selectedAestheticGradients;
      const updatedAG = currentAG.map((item) => {
        if (item.model.id === modelId) {
          const newVersion = findVersionById(item.model, versionId);
          if (newVersion) {
            return { ...item, version: newVersion };
          } else {
            console.warn(
              `Cannot update Aesthetic Gradient version for model ID ${modelId}: Version ID ${versionId} not found.`
            );
            return item;
          }
        }
        return item;
      });
      set({ selectedAestheticGradients: updatedAG });
    },

    updateControlnetVersion: (modelId, versionId) => {
      const currentCN = get().selectedControlnets;
      const updatedCN = currentCN.map((item) => {
        if (item.model.id === modelId) {
          const newVersion = findVersionById(item.model, versionId);
          if (newVersion) {
            return { ...item, version: newVersion };
          } else {
            console.warn(
              `Cannot update Controlnet version for model ID ${modelId}: Version ID ${versionId} not found.`
            );
            return item;
          }
        }
        return item;
      });
      set({ selectedControlnets: updatedCN });
    },

    updatePoseVersion: (versionId) => {
      const currentPose = get().selectedPose;
      if (!currentPose) {
        console.warn('Cannot update pose version: No pose model is currently selected.');
        return;
      }
      const model = currentPose.model;
      const newVersion = findVersionById(model, versionId);

      if (!newVersion) {
        console.warn(
          `Cannot update pose version for model ${model.name} (ID: ${model.id}): Version with ID ${versionId} not found.`
        );
        return;
      }

      set({
        selectedPose: { model: model, version: newVersion },
      });
    },

    setSelectedAspectRatio: (ratio) => {
      set({ selectedAspectRatio: ratio });
    },
    setUseCustomRatio: (useCustom) => {
      set({ useCustomRatio: useCustom });
    },

    // --- Load From Params Action ---
    // This needs to look up models and versions using the provided modelsData
    loadFromParams: (params, modelsData) => {
      const updates: Partial<GenerationState> = {};

      if (params.prompt !== undefined) updates.prompt = params.prompt;
      if (params.negativePrompt !== undefined) updates.negativePrompt = params.negativePrompt;
      if (params.width !== undefined) updates.width = String(params.width);
      if (params.height !== undefined) updates.height = String(params.height);
      if (params.numImages !== undefined) updates.numImages = String(params.numImages);

      // Handle seed parameter
      if (params.seed !== undefined && params.seed !== null) {
        const seedVal = String(params.seed);
        if (seedVal === '-1' || seedVal.toLowerCase() === 'random') {
          // Using -1 or 'random' for random seed is common
          updates.useRandomSeed = true;
          // Do not set the seed input field value here if random is active
          // If you want to show '-1' in the input when random is true, uncomment the next line
          // updates.seed = '-1';
        } else {
          updates.useRandomSeed = false;
          updates.seed = seedVal;
        }
      } // If seed param is missing, leave current state for seed/useRandomSeed

      // --- Model Selections from Params ---
      // Expecting params like:
      // {
      //   checkpointId: 123, checkpointVersionId: 456,
      //   loras: [{ modelId: 789, versionId: 101 }, { modelId: 112, versionId: 131 }], // Array of objects for multi-select
      //   poseId: 141, poseVersionId: 151
      // }
      // Or simpler:
      // {
      //    checkpointId: 123, // implies default version
      //    loraIds: [789, 112], // implies default versions
      //    poseId: 141 // implies default version
      // }

      // Checkpoint
      if (modelsData.checkpoints && params.checkpointId !== undefined) {
        const model = findModelById(modelsData.checkpoints, params.checkpointId);
        if (model) {
          const version =
            params.checkpointVersionId !== undefined
              ? findVersionById(model, Number(params.checkpointVersionId))
              : getDefaultVersion(model);
          if (version) {
            updates.selectedCheckpoint = { model, version };
          } else {
            console.warn(
              `loadFromParams: Checkpoint version (ID ${params.checkpointVersionId}) not found for model ${model.name} (ID ${model.id}). Skipping checkpoint selection.`
            );
          }
        } else {
          console.warn(
            `loadFromParams: Checkpoint model with ID ${params.checkpointId} not found in provided modelsData.`
          );
        }
      } else if (params.checkpointId === null) {
        // Allow explicitly setting to null from params
        updates.selectedCheckpoint = null;
      }

      // LoRAs (Handle array of IDs or array of {modelId, versionId})
      if (modelsData.loras) {
        let loraSelections: SelectedModelAndVersion[] = [];
        if (Array.isArray(params.loraIds)) {
          // Handle simple array of IDs (use default version)
          loraSelections = params.loraIds
            .map((loraId: string) => findModelById(modelsData.loras, loraId))
            .filter(
              (model: any | undefined): model is CivitaiModelWithRelations => model !== undefined
            )
            .map((model: any) => {
              const version = getDefaultVersion(model);
              if (version) return { model, version };
              console.warn(
                `loadFromParams: Default LoRA version not found for model ${model.name} (ID ${model.id}). Skipping.`
              );
              return undefined; // Filter out models without a default version
            })
            .filter(
              (selection: any): selection is SelectedModelAndVersion => selection !== undefined
            );
        } else if (Array.isArray(params.loras)) {
          // Handle array of {modelId, versionId} objects
          loraSelections = params.loras
            .map((item: { modelId: number | string; versionId?: number | string }) => {
              const model = findModelById(modelsData.loras, item.modelId);
              if (!model) {
                console.warn(
                  `loadFromParams: LoRA model with ID ${item.modelId} not found in modelsData.`
                );
                return undefined;
              }
              const version =
                item.versionId !== undefined
                  ? findVersionById(model, Number(item.versionId))
                  : getDefaultVersion(model);

              if (version) return { model, version };

              console.warn(
                `loadFromParams: LoRA version (ID ${item.versionId}) not found for model ${model.name} (ID ${model.id}). Skipping.`
              );
              return undefined;
            })
            .filter(
              (selection: any): selection is SelectedModelAndVersion => selection !== undefined
            );
        }
        if (loraSelections.length > 0) {
          updates.selectedLoras = loraSelections.slice(0, 6); // Enforce max limit
        } else if (params.loras !== undefined || params.loraIds !== undefined) {
          // If params were provided but resulted in no selections, clear the state
          updates.selectedLoras = [];
        }
      }
      // Add similar logic for Textual Inversions, Hypernetworks, Aesthetic Gradients, Controlnets...

      // Pose
      if (modelsData.poses && params.poseId !== undefined) {
        const model = findModelById(modelsData.poses, params.poseId);
        if (model) {
          const version =
            params.poseVersionId !== undefined
              ? findVersionById(model, Number(params.poseVersionId))
              : getDefaultVersion(model);
          if (version) {
            updates.selectedPose = { model, version };
          } else {
            console.warn(
              `loadFromParams: Pose version (ID ${params.poseVersionId}) not found for model ${model.name} (ID ${model.id}). Skipping pose selection.`
            );
          }
        } else {
          console.warn(
            `loadFromParams: Pose model with ID ${params.poseId} not found in provided modelsData.`
          );
        }
      } else if (params.poseId === null) {
        // Allow explicitly setting to null from params
        updates.selectedPose = null;
      }

      // Aspect Ratio / Custom state based on width/height params
      // This should ideally run AFTER width/height params are processed
      if (params.width !== undefined && params.height !== undefined) {
        const paramWidth = String(params.width);
        const paramHeight = String(params.height);
        const paramRatio = `${paramWidth}*${paramHeight}`;

        // Check if the width/height match a predefined ratio
        // Note: ASPECT_RATIOS should probably be in 'width*height' format strings
        if (ASPECT_RATIOS.includes(paramRatio)) {
          updates.selectedAspectRatio = paramRatio;
          updates.useCustomRatio = false;
          // Width/Height were already set above from params
        } else {
          // If width/height don't match a predefined ratio, it's custom
          updates.selectedAspectRatio = 'custom';
          updates.useCustomRatio = true;
          // Width/Height were already set above from params
        }
      } else if (
        updates.useCustomRatio === undefined &&
        updates.selectedAspectRatio === undefined
      ) {
        // If params had no width/height and were not setting ratio/custom state,
        // ensure width/height are consistent with initial state or persisted state ratio
        // This part is tricky - ideally, UI components read width/height from state
        // and set them when ratio changes. LoadFromParams should just set what's in params.
        // If width/height params are *missing*, we might want to fallback to the width/height implied
        // by a potentially provided `selectedAspectRatio` param, or the initial state's 512x512.
        // Let's keep it simple for now: if width/height params are missing, store uses its current state.
      }

      // Apply all collected updates
      // Use `get()` to merge updates with current state if needed,
      // or just set directly if updates are meant to override.
      // Let's override for params.
      set(updates);
    },

    resetState: () =>
      set({
        prompt: '',
        negativePrompt: '',
        width: '512',
        height: '512',
        numImages: '1',
        seed: '',
        useRandomSeed: true,

        selectedCheckpoint: null,
        selectedLoras: [],
        selectedTextualInversions: [],
        selectedHypernetworks: [],
        selectedAestheticGradients: [],
        selectedControlnets: [],
        selectedPose: null,

        selectedAspectRatio: '512*512',
        useCustomRatio: false,
      }),
  })
  // {
  //   name: 'generation-storage', // unique name
  //   storage: createJSONStorage(() => zustandStorage), // Use MMKV storage

  //   // Partialize function to specify what gets persisted
  //   // We now persist the { model, version } structure directly.
  //   // Be aware that CivitaiModelWithRelations can be large. If this causes performance
  //   // issues on rehydration or excessive storage use, you might need a custom
  //   // reviver/replacer or persist only IDs and refetch data on load.
  //   // For a typical RN app with MMKV, this might be acceptable.
  //   partialize: (state) => ({
  //     prompt: state.prompt,
  //     negativePrompt: state.negativePrompt,
  //     width: state.width,
  //     height: state.height,
  //     numImages: state.numImages,
  //     seed: state.seed,
  //     useRandomSeed: state.useRandomSeed,
  //     selectedCheckpoint: state.selectedCheckpoint, // Now persists { model, version } or null
  //     selectedLoras: state.selectedLoras, // Now persists array of { model, version }
  //     selectedTextualInversions: state.selectedTextualInversions,
  //     selectedHypernetworks: state.selectedHypernetworks,
  //     selectedAestheticGradients: state.selectedAestheticGradients,
  //     selectedControlnets: state.selectedControlnets,
  //     selectedPose: state.selectedPose, // Now persists { model, version } or null
  //     selectedAspectRatio: state.selectedAspectRatio,
  //     useCustomRatio: state.useCustomRatio,
  //   }),

  //   // Optional: Add version migrations if state structure changes in the future
  //   // version: 0,
  //   // migrate: (persistedState, version) => { ... }
  // }
);

export default useGenerationStore;

// Make sure ASPECT_RATIOS is defined or imported correctly elsewhere
// import { ASPECT_RATIOS } from '~/constants/generation';

// Ensure SelectCivitaiModelVersion is not mistakenly used where
// CivitaiModelVersionWithFilesAndImages is expected.
// Remove the duplicate/unused import if necessary:
// import {SelectCivitaiModelVersion} from '~/backend/schema'; // Remove this line if not used
