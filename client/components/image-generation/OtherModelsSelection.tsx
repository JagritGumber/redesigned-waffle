// src/components/image-generation/OtherModelsSelection.tsx
import React from 'react';
import { Text, YStack, SizableText } from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import ModelSelectList from '../ModelSelectList';

interface OtherModelsSelectionProps {
  title: string;
  models: CivitaiModelWithRelations[] | undefined;
  loading: boolean;
  onModelPress: (model: CivitaiModelWithRelations) => void;
  isSelected: (modelId: string | number) => boolean;
  columns: number;
  extraData: any;
}

const OtherModelsSelection: React.FC<OtherModelsSelectionProps> = React.memo(
  ({ title, models, loading, onModelPress, isSelected, columns, extraData }) => {
    console.log(`Rendering ${title} Selection`); // Log render
    if (loading) {
      return null; // Parent handles overall loading spinner
    }

    if (!models || models.length === 0) {
      return (
        <SizableText size="$3" color="$gray10" marginTop={10}>
          No {title} models found.
        </SizableText>
      );
    }

    return (
      <>
        <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
          Select {title}:
        </Text>
        <YStack mb="$2">
          <ModelSelectList
            numColumns={columns}
            models={models}
            onModelPress={onModelPress}
            isSelected={isSelected}
            extraData={extraData}
          />
        </YStack>
      </>
    );
  }
);

export default OtherModelsSelection;
