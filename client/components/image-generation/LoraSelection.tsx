// src/components/image-generation/LoraSelection.tsx
import React from 'react';
import { Text, YStack, SizableText } from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import ModelSelectList from '../ModelSelectList';

interface LoraSelectionProps {
  loras: CivitaiModelWithRelations[] | undefined;
  loadingLoras: boolean;
  onModelPress: (model: CivitaiModelWithRelations) => void; // This handler includes the limit check
  isSelected: (modelId: string | number) => boolean;
  columns: number;
  extraData: any;
}

const LoraSelection: React.FC<LoraSelectionProps> = React.memo(
  ({ loras, loadingLoras, onModelPress, isSelected, columns, extraData }) => {
    console.log('Rendering LoraSelection'); // Log render
    if (loadingLoras) {
      return null; // Parent handles overall loading spinner
    }

    if (!loras || loras.length === 0) {
      return (
        <SizableText size="$3" color="$gray10" marginTop={10}>
          No LoRA models found.
        </SizableText>
      );
    }

    return (
      <>
        <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
          Select LoRAs (Max 6):
        </Text>
        <YStack mb="$2">
          <ModelSelectList
            numColumns={columns}
            models={loras}
            onModelPress={onModelPress}
            isSelected={isSelected}
            extraData={extraData}
          />
        </YStack>
      </>
    );
  }
);

export default LoraSelection;
