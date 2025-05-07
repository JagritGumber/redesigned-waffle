// src/components/image-generation/PoseSelection.tsx
import React from 'react';
import { Text, YStack, SizableText, Button, XStack } from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import { CivitaiModelVersionWithFilesAndImages } from '~/backend/schema/modelVersions';
import ModelSelectList from '../ModelSelectList';

// Define the expected structure for selectedPose
interface SelectedPoseItem {
  model: CivitaiModelWithRelations;
  version: CivitaiModelVersionWithFilesAndImages;
}

interface PoseSelectionProps {
  poses: CivitaiModelWithRelations[] | undefined;
  loadingPoses: boolean;
  onModelPress: (model: CivitaiModelWithRelations) => void; // This handler includes toggle logic
  isSelected: (modelId: string | number) => boolean; // Checks if this specific pose model is selected
  selectedPose: SelectedPoseItem | null; // The currently selected pose object from the store
  onDeselect: () => void; // Callback to deselect the pose
  columns: number;
  extraData: any;
  hasControlnetsSelected: boolean; // To show the warning
}

const PoseSelection: React.FC<PoseSelectionProps> = React.memo(
  ({
    poses,
    loadingPoses,
    onModelPress,
    isSelected,
    selectedPose,
    onDeselect,
    columns,
    extraData,
    hasControlnetsSelected,
  }) => {
    console.log('Rendering PoseSelection'); // Log render
    if (loadingPoses) {
      return null; // Parent handles overall loading spinner
    }

    if (!poses || poses.length === 0) {
      return (
        <SizableText size="$3" color="$gray10" marginTop={10}>
          No Pose models found.
        </SizableText>
      );
    }

    // Helper to get the selected model name and version name for display
    const getSelectedModelInfo = (item: SelectedPoseItem | null) => {
      if (!item) return 'None selected';
      return `${item.model.name} (${item.version.name})`;
    };

    return (
      <>
        <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
          Select Pose (uses ControlNet):
        </Text>
        {/* Display currently selected pose with a clear option */}
        {selectedPose && (
          <YStack space="$1" mb="$2">
            <SizableText size="$3">Currently Selected Pose Model:</SizableText>
            <Button
              key={selectedPose.model.id}
              size="$3"
              chromeless
              borderWidth={1}
              borderColor="$accent10"
              backgroundColor="$accent0"
              color="$accent12"
              onPress={onDeselect}>
              <XStack gap="$1" alignItems="center">
                <Text fontWeight="bold">{selectedPose.model.name}</Text>
                <Text fontSize="$2">({selectedPose.version.name})</Text>
                <Text fontSize="$3" color="$red9">
                  X
                </Text>
              </XStack>
            </Button>
          </YStack>
        )}
        {/* Show selection list if no pose is selected OR if there are other poses to choose */}
        {(!selectedPose || (poses && poses.length > 1)) && (
          <YStack mb="$2">
            <ModelSelectList
              numColumns={columns}
              models={poses}
              onModelPress={onModelPress}
              isSelected={isSelected}
              extraData={extraData}
            />
          </YStack>
        )}
        {/* Note about ControlNet input image */}
        {(selectedPose || hasControlnetsSelected) && (
          <SizableText size="$2" color="$yellow10" mb="$3">
            Note: ControlNet/Pose requires an input image (e.g., a pose image) and preprocessor
            selection in the payload, which is not currently implemented in this UI. Generation may
            fail or behave unexpectedly without it.
          </SizableText>
        )}
      </>
    );
  }
);

export default PoseSelection;
