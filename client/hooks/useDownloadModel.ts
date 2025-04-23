import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useLocalSearchParams } from 'expo-router';
import { Model as CivitaiApiModel } from '~/types/civitai';
import { Alert } from 'react-native';

/**
 * Mutation hook to initiate a model download.
 */
export const useDownloadModel = () => {
  const queryClient = useQueryClient();
  // Access route params *outside* the mutation function but within the hook context
  const { id: civitaiId } = useLocalSearchParams<{ id: string }>(); // Get Civitai ID

  return useMutation({
    mutationFn: async (modelData: CivitaiApiModel) => {
      // Expecting the Civitai API model data
      // Your current backend POST returns { message, status, runpodJobId }
      console.log(modelData);
      const response = await axios.post<{
        message: string;
        status: string; // 'IN_PROGRESS' or 'ERROR' from your backend
        runpodJobId?: string;
      }>(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model`, { model: modelData });
      return response.data;
    },
    onSuccess: (data, variables) => {
      // variables here is the modelData (CivitaiApiModel)
      console.log('Download initiation successful:', data);
      // Invalidate the query for this specific model to trigger a re-fetch.
      // Use the Civitai ID from the route params (or passed in variables if preferred)
      if (civitaiId) {
        queryClient.invalidateQueries({ queryKey: ['downloadedModel', String(civitaiId)] });
      } else {
        console.warn('Civitai ID not available in onSuccess to invalidate query.');
        // Fallback: Invalidate list queries if necessary, though less precise
        // queryClient.invalidateQueries({ queryKey: ['models'] });
      }

      // Alert user on success (based on backend response status)
      if (data.status === 'IN_PROGRESS') {
        Alert.alert('Download Initiated', data.message);
      } else {
        // Should theoretically be 'ERROR' based on your backend logic
        Alert.alert('Error', data.message || 'Failed to initiate download.');
      }
    },
    onError: (error: any, variables) => {
      // Use `any` for broader error handling or a specific error type
      console.error('Download initiation failed:', error);
      // Invalidate the query on error as well to pick up any potential partial updates or error status
      if (civitaiId) {
        queryClient.invalidateQueries({ queryKey: ['downloadedModel', String(civitaiId)] });
      } else {
        console.warn('Civitai ID not available in onError to invalidate query.');
      }
      Alert.alert(
        'Error',
        error.response?.data?.error || error.message || 'Failed to initiate download.'
      );
    },
  });
};
