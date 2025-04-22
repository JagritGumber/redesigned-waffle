// src/components/DownloadedModelsList.tsx
import React from 'react';
import { Dimensions } from 'react-native';
import { Text, Spinner, View, YStack } from 'tamagui';
import ModelCard from './ModelCard';
import { CivitaiModelWithRelations } from '~/backend/schema/models'; // Adjust path
import DownloadedModelCard from './DownloadedModelCard';

const { width: screenWidth } = Dimensions.get('window');
const cardMarginBase = 16; // Theme spacing
const cardGapBase = 16;

interface DownloadedModelsListProps {
  models: CivitaiModelWithRelations[];
  isLoading: boolean;
  isError: boolean;
  error?: Error | null; // Optional, but useful to pass for displaying message
  numColumns?: number; // Optional: Allow the parent to control column count
}

const DownloadedModelsList: React.FC<DownloadedModelsListProps> = ({
  models,
  isLoading,
  isError,
  error,
  numColumns = 2, // Default to 2 columns if not specified
}) => {
  const cardWidth = `calc(${100 / numColumns}% - ${cardGapBase}px)`;
  const marginRight = cardGapBase;
  const marginBottom = cardGapBase;

  if (isLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner size="large" color="$blue10" />
        <Text mt="$2" color="$color11">
          Loading downloaded models...
        </Text>
      </YStack>
    );
  }

  if (isError) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$red10">Error fetching downloaded models:</Text>
        <Text color="$red10" fontSize="$2">
          {error?.message || 'Unknown error'}
        </Text>
      </YStack>
    );
  }

  if (models.length === 0) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Text>No models downloaded yet.</Text>
      </YStack>
    );
  }

  return (
    <View
      flexDirection="row"
      flexWrap="wrap"
      justifyContent="flex-start"
      bg={'$background'}
      pl={'$4'}>
      {models.map((model, index) => (
        <View
          key={model.id}
          width={cardWidth}
          marginBottom={marginBottom}
          marginRight={(index + 1) % numColumns !== 0 ? marginRight : undefined}>
          <DownloadedModelCard model={model} />
        </View>
      ))}
    </View>
  );
};

export default DownloadedModelsList;
