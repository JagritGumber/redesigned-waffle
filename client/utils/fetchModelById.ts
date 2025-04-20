import axios from 'axios';
import { CivitaiModelWithRelations } from '~/backend/schema/models';

const fetchModelById = async (
  id: string,
  setter: React.Dispatch<React.SetStateAction<CivitaiModelWithRelations | null>>
) => {
  try {
    const response = await axios.get<{
      message: string;
      model?: CivitaiModelWithRelations;
      error?: string;
    }>(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${id}`);
    if (response.status !== 200) {
      console.error(`Failed to fetch ${id}:`, response.status);
      return;
    }
    const { data } = response;
    setter(data.model ?? null);
  } catch (error) {
    console.error(`Error fetching ${id}:`, error);
  }
};

export default fetchModelById;
