// ~/store/usePostEditorStore.ts
import { create } from 'zustand';
import { SelectPostTemplate } from '~/backend/schema';

// Define the initial state structure for the post editor
const initialPostState: Omit<SelectPostTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'text',
  name: '',
  description: '',
  options: ['', ''],
  imageKeys: [],
  title: '',
};

interface PostEditorState {
  post: Omit<SelectPostTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  templateId: string | null;
  isCreating: boolean;
  isLoading: boolean; // For initial template load
  isSaving: boolean;
  isPosting: boolean;
  statusMessage: string | null;
  error: string | null;
}

interface PostEditorActions {
  setPost: (post: Omit<SelectPostTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePost: (
    update:
      | Partial<Omit<SelectPostTemplate, 'id' | 'createdAt' | 'updatedAt'>>
      | ((
          prev: Omit<SelectPostTemplate, 'id' | 'createdAt' | 'updatedAt'>
        ) => Partial<Omit<SelectPostTemplate, 'id' | 'createdAt' | 'updatedAt'>>)
  ) => void;
  resetState: () => void;
  setTemplateInfo: (id: string | null, isCreating: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setSaving: (isSaving: boolean) => void;
  setPosting: (isPosting: boolean) => void;
  setStatusMessage: (message: string | null) => void;
  setError: (error: string | null) => void;
}

const usePostEditorStore = create<PostEditorState & PostEditorActions>()((set) => ({
  // State
  post: { ...initialPostState },
  templateId: null,
  isCreating: true,
  isLoading: false,
  isSaving: false,
  isPosting: false,
  statusMessage: null,
  error: null,

  // Actions
  setPost: (post) => set({ post }),
  updatePost: (update) =>
    set((state) => {
      const updateObj = typeof update === 'function' ? update(state.post) : update;
      return {
        post: {
          ...state.post,
          ...updateObj,
        },
      };
    }),
  resetState: () =>
    set({
      post: { ...initialPostState },
      templateId: null,
      isCreating: true,
      isLoading: false,
      isSaving: false,
      isPosting: false,
      statusMessage: null,
      error: null,
    }),
  setTemplateInfo: (id, isCreating) => set({ templateId: id, isCreating }),
  setLoading: (isLoading) => set({ isLoading }),
  setSaving: (isSaving) => set({ isSaving }),
  setPosting: (isPosting) => set({ isPosting }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  setError: (error) => set({ error }),
}));

export default usePostEditorStore;
