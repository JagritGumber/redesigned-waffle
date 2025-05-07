// src/components/image-generation/CheckpointSelection.tsx
import React from 'react';
import { Text, YStack, SizableText, Spinner } from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import ModelSelectList from '../ModelSelectList';

interface CheckpointSelectionProps {
  checkpoints: CivitaiModelWithRelations[] | undefined;
  loadingCheckpoints: boolean;
  columns: number;
  extraData: any;
}

const CheckpointSelection: React.FC<CheckpointSelectionProps> = React.memo(
  ({ checkpoints, loadingCheckpoints, columns, extraData }) => {
    console.log('Rendering CheckpointSelection'); // Log render
    if (loadingCheckpoints) {
      return (
        <YStack flex={1} justifyContent="center" alignItems="center" minHeight={100}>
          <Spinner size="small" color="$green10" />
          <SizableText mt="$2" size="$3">
            Loading Checkpoints...
          </SizableText>
        </YStack>
      );
    }

    if (!checkpoints || checkpoints.length === 0) {
      return (
        <SizableText size="$3" color="$gray10" marginTop={10}>
          No checkpoint models found.
        </SizableText>
      );
    }

    return (
      <YStack mb="$2">
        <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
          Select Checkpoint (Required):
        </Text>
        <ModelSelectList numColumns={columns} models={checkpoints} extraData={extraData} />
      </YStack>
    );
  }
);

export default CheckpointSelection;
