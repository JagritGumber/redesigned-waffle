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

  const { id: civitaiId } = useLocalSearchParams<{ id: string }>();

  return useMutation({
    mutationFn: async ({
      model,
      versionId,
      fileId,
      defaultDownload,
    }: {
      model: CivitaiApiModel;
      versionId: number;
      fileId: number;
      defaultDownload: boolean;
    }) => {
      const response = await axios.post<{
        message: string;
        status: string;
        runpodJobId?: string;
      }>(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model`, {
        model,
        versionId,
        fileId,
        defaultDownload,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      console.log('Download initiation successful:', data);

      if (civitaiId) {
        queryClient.invalidateQueries({ queryKey: ['downloadedModel', String(civitaiId)] });
      } else {
        console.warn('Civitai ID not available in onSuccess to invalidate query.');
      }

      if (data.status === 'IN_PROGRESS') {
        Alert.alert('Download Initiated', data.message);
      } else {
        Alert.alert('Error', data.message || 'Failed to initiate download.');
      }
    },
    onError: (error: any, variables) => {
      console.error('Download initiation failed:', error);

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
