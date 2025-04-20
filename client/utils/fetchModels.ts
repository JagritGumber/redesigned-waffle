import { fetch } from 'expo/fetch';
import { useQuery } from '@tanstack/react-query';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import axios from 'axios';

const getModels = async (type: string): Promise<CivitaiModelWithRelations[]> => {
  const response = await axios.get<{ models: CivitaiModelWithRelations[] }>(
    `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${type.toLowerCase().replace(/ /g, '-')}`
  );
  if (response.status !== 200) {
    console.error(`Failed to fetch ${type}:`, response.status);
    throw new Error(`Failed to fetch ${type}: ${response.status}`); // Throw error to be handled by useQuery
  }
  return response.data.models;
};

// 2. Create a hook that uses useQuery
const useModels = (type: string) => {
  return useQuery<CivitaiModelWithRelations[], Error>({
    // Explicitly type the success and error data
    queryKey: ['models', type.toLowerCase().replace(/ /g, '-')], // Unique query key based on model type
    queryFn: () => getModels(type), // Call the fetch function
    // Optional: You can add configurations here like:
    // staleTime: 60 * 1000, // 1 minute - Data is considered fresh for 1 minute
    // cacheTime: 5 * 60 * 1000, // 5 minutes - Keep data in cache for 5 minutes
    // retry: 3, // Retry 3 times on error
    // onError: (error) => { console.error("Query Error:", error); }, // Custom error handling
  });
};

export default useModels;
