import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

/**
 * Mutation hook to initiate a single model deletion.
 */
export const useDeleteModel = () => {
  const queryClient = useQueryClient();
  // Access route params for Civitai ID
  const { id: civitaiId } = useLocalSearchParams<{ id: string }>();

  return useMutation({
    mutationFn: async (modelId: number) => {
      const response = await axios.delete<{
        message: string;
        civitaiId?: string | number;
      }>(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${modelId}`);
      return response.data;
    },
    onSuccess: (data, variables) => {
      console.log('Deletion initiation successful:', data);
      if (civitaiId) {
        queryClient.invalidateQueries({ queryKey: ['downloadedModel', String(civitaiId)] });
      } else {
        console.warn('Civitai ID not available in onSuccess to invalidate query for deletion.');
      }
      Alert.alert('Deletion Initiated', data.message || 'Deletion process started.');
    },
    onError: (error: any, variables) => {
      console.error('Deletion initiation failed:', error);
      // Invalidate on error to potentially pick up DELETE_FAILED status (if backend updates status instead of deleting row)
      if (civitaiId) {
        queryClient.invalidateQueries({ queryKey: ['downloadedModel', String(civitaiId)] });
      } else {
        console.warn('Civitai ID not available in onError to invalidate query for deletion.');
      }
      Alert.alert(
        'Error',
        error.response?.data?.error || error.message || 'Failed to initiate deletion.'
      );
    },
  });
};
