// src/components/image-generation/ModelSelectItemCard.tsx
import React, { useState, useCallback, useMemo, useEffect } from 'react'; // Import useEffect
import { StyleSheet, TouchableOpacity, GestureResponderEvent, Alert } from 'react-native';
import { CivitaiModelWithRelations, CivitaiModelVersionWithFilesAndImages } from '~/backend/schema';
import { MoreHorizontal } from '@tamagui/lucide-icons';
import {
  View,
  Image,
  Text,
  Card,
  Input,
  Button,
  XStack,
  useTheme,
  YStack,
  AlertDialog,
  Dialog, // Import Dialog for version selection
  ScrollView, // For scrolling list of versions
  RadioGroup, // For selecting a single version
  Label, // For radio group labels
  SizableText, // Use SizableText for consistency
} from 'tamagui';
import { Chip } from './ui/Chip';
import { renderbaseModelChip } from '~/utils/renderBaseModelChip';
import useGenerationStore from '~/store/useGenerationStore';

interface ModelSelectItemCardProps {
  model: CivitaiModelWithRelations;
}

const getModelTypeAbbreviation = (type: string | undefined) => {
  if (!type) return '';
  switch (type?.toLowerCase().split(' ').join('')) {
    case 'checkpoint':
      return 'CK';
    case 'textualinversion':
      return 'TI';
    case 'controlnet':
      return 'CN';
    case 'pose':
      return 'Pose';
    case 'hypernetwork':
      return 'HN';
    case 'lora':
      return 'LoRA';
    case 'aestheticgradient':
      return 'AG';
    default:
      return type;
  }
};

// Wrap the card component in React.memo
const ModelSelectItemCard: React.FC<ModelSelectItemCardProps> = ({ model }) => {
  const selectedCheckpoint = useGenerationStore((state) => state.selectedCheckpoint);
  const isSelected = useMemo(() => {
    return selectedCheckpoint?.model.id === model.id;
  }, [selectedCheckpoint]);
  const { setSelectedCheckpoint } = useGenerationStore.getState();

  // Local state for the weight editing dialog
  const [weight, setWeight] = useState<number | string>(model.defaultWeight ?? '');
  // State to control the version selection dialog visibility
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  // State to hold the selected version ID WITHIN the version dialog before confirming
  const [tempSelectedVersionId, setTempSelectedVersionId] = useState<string | number | null>(null);

  const theme = useTheme();

  // Determine the currently displayed version based on selection state and prop
  const displayedVersion = useMemo(() => {
    // If the card is selected and a specific version ID is provided via props, try to find that version
    if (isSelected) {
      const foundVersion = model.modelVersions?.find(
        (v) => String(v.id) === String(selectedCheckpoint?.version.id)
      );
      if (foundVersion) {
        return foundVersion;
      }
      // Fallback if selectedVersionId is invalid or not found (shouldn't happen if store is consistent)
      console.warn(
        `Selected version ID ${selectedCheckpoint?.version.id} not found for model ${model.id}. Falling back to first version.`
      );
      return model.modelVersions?.[0];
    }
    // If not selected, or no selectedVersionId prop, display the first version
    return model.modelVersions?.[0];
  }, [model.modelVersions, isSelected, selectedCheckpoint?.version.id]); // Dependencies: model versions, selection state, and the specific selected version ID

  // Effect to sync local weight state if defaultWeight on the model prop changes (e.g. after save)
  useEffect(() => {
    // Only update if the incoming model's defaultWeight is different from the local state,
    // and ensure the local state isn't mid-edit (optional, but prevents input jumping)
    if (model.defaultWeight !== undefined && Number(weight) !== model.defaultWeight) {
      console.log(`Syncing weight for ${model.id}: ${model.defaultWeight}`);
      setWeight(model.defaultWeight ?? 0.6);
    }
  }, [model.defaultWeight]); // Depend on the model's defaultWeight prop

  const handlePressCard = useCallback(() => {
    console.log('ModelSelectItemCard pressed:', model.id, 'Current isSelected:', isSelected);
    if (isSelected && model.modelVersions && model.modelVersions.length > 1) {
      console.log('Card already selected and has multiple versions. Opening version dialog.');
      // Initialize temp selected version in dialog to the currently displayed version's ID
      setTempSelectedVersionId(displayedVersion?.id || model.modelVersions[0]?.id || null);
      setIsVersionDialogOpen(true);
    } else {
      console.log('Card not selected or no multiple versions. Calling onPress.');
      if (model.type === 'Checkpoint') setSelectedCheckpoint(model, model.modelVersions?.at(0)?.id);
    }
  }, [isSelected, model, model.modelVersions, displayedVersion?.id]); // Add dependencies

  const handleEditWeightTriggerPress = useCallback(() => {
    // No stopPropagation needed on Tamagui AlertDialog.Trigger asChild
    console.log('Edit weight trigger pressed');
    // Sync local weight state when opening the dialog
    setWeight(model.defaultWeight ?? '');
  }, [model.defaultWeight]);

  const handleWeightChange = useCallback((newWeight: string) => {
    setWeight(newWeight);
  }, []); // No dependencies needed if setWeight is stable

  const handleSaveWeight = useCallback(async () => {
    console.log('Attempting to save weight for:', model.id, 'New weight:', weight);

    const weightValue = Number(weight);
    if (isNaN(weightValue)) {
      Alert.alert('Invalid Input', 'Please enter a valid number for weight.');
      return false; // Prevent closing dialog on validation error
    }

    if (!process.env.EXPO_PUBLIC_BACKEND_URL) {
      Alert.alert('Configuration Error', 'Backend URL is not configured.');
      return false; // Prevent closing dialog on config error
    }

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${model.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ defaultWeight: weightValue }),
        }
      );

      if (response.ok) {
        console.log('Weight updated successfully for model ID:', model.id);
        // Success, the AlertDialog.Action asChild will close the dialog
        // Optionally, call a parent prop or dispatch a store action to update
        // the model list data in the store to reflect the saved weight change
        // globally, triggering a re-render of this card item via `model.defaultWeight` prop change.
        // E.g., `onWeightSaved?.(model.id, weightValue);` (requires adding a new prop)
        return true; // Signal success to AlertDialog.Action
      } else {
        const errorData = await response.json();
        console.error('Failed to update weight:', response.status, errorData);
        Alert.alert('Update Failed', errorData.message || 'Could not save weight.');
        // Do NOT close the dialog on failure
        return false; // Signal failure to AlertDialog.Action
      }
    } catch (error) {
      console.error('Error updating weight:', error);
      Alert.alert('Error', 'An error occurred while saving weight.');
      // Do NOT close the dialog on failure
      return false; // Signal failure to AlertDialog.Action
    }
  }, [weight, model.id]); // Depend on weight and model.id

  const handleVersionSelectConfirm = useCallback(() => {
    const version = model.modelVersions?.find(
      (v) => String(v.id) === String(tempSelectedVersionId)
    );
    if (version) {
      console.log('Confirming version selection for model:', model.id, 'version:', version.id);
      if (model.type === 'Checkpoint') {
        setSelectedCheckpoint(model, version.id);
      }
    } else {
      console.warn(`Version ${tempSelectedVersionId} not found or onVersionSelect not provided.`);
      setSelectedCheckpoint(model);
    }
    setIsVersionDialogOpen(false); // Close dialog regardless of version found/handler called
  }, [model, tempSelectedVersionId]); // Dependencies

  const handleVersionDialogCancel = useCallback(() => {
    setIsVersionDialogOpen(false);
    // Optionally reset tempSelectedVersionId here if you want the dialog to open
    // showing the *currently* selected version next time, not the previously
    // unsaved selection. If not reset, it remembers the last selected choice in the dialog.
    // setTempSelectedVersionId(displayedVersion?.id || model.modelVersions[0]?.id || null); // Reset to current
  }, []); // No dependencies

  // Only render if model and versions exist
  if (!model || !model.modelVersions || model.modelVersions.length === 0) {
    console.warn('Model card not rendering due to missing data:', model?.id);
    return null;
  }

  return (
    <>
      {/* Card */}
      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.cardButton,
          isSelected && styles.selectedCardButton,
          isSelected && {
            borderColor: theme.accent10.get(), // Apply Tamagui theme color
          },
        ]}
        onPress={handlePressCard} // Use the unified handler
      >
        {/* Key prop should be on the top-level element rendered in a list, which is TouchableOpacity here */}
        <Card key={`card-${model.id}`} style={styles.card}>
          {/* Image uses displayedVersion */}
          {displayedVersion?.images?.[0]?.url && (
            <Image
              source={{ uri: displayedVersion.images[0].url }}
              style={styles.cardImage}
              objectFit="cover"
            />
          )}

          <XStack p={4} pos={'absolute'} top={0} left={0} right={0} gap={2} zIndex={1}>
            <Chip size={'$2'} bg={'rgba(0, 0, 0, 0.5)'} w={'fit-content'}>
              <Text color="white" fontSize={10}>
                {getModelTypeAbbreviation(model.type)}
              </Text>
              {/* Smaller text in chip */}
            </Chip>
            {displayedVersion?.baseModel && (
              <Chip size={'$2'} bg={'rgba(0, 0, 0, 0.5)'} w={'fit-content'}>
                <Text color="white" fontSize={10}>
                  {renderbaseModelChip(displayedVersion.baseModel)}
                </Text>
                {/* Smaller text in chip */}
              </Chip>
            )}
            {/* Weight Edit Dialog Trigger (AlertDialog) - Only for types that might need weight */}
            {['lora', 'checkpoint'].includes(model.type?.toLowerCase() || '') && ( // Check model type (case-insensitive comparison might be better)
              <View position="absolute" top={0} right={0} p={4} zIndex={2}>
                <AlertDialog>
                  <AlertDialog.Trigger asChild>
                    <Button
                      size={'$1'}
                      circular
                      icon={<MoreHorizontal size={16} />}
                      onPress={handleEditWeightTriggerPress}
                    />
                  </AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay
                      key="overlay"
                      animation="quick"
                      opacity={0.5}
                      enterStyle={{ opacity: 0 }}
                      exitStyle={{ opacity: 0 }}
                    />
                    <AlertDialog.Content
                      bordered
                      elevate
                      key="content"
                      animation={['quick', { opacity: { overshootClamping: true } }]}
                      enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
                      exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
                      x={0}
                      scale={1}
                      opacity={1}
                      y={0}>
                      <AlertDialog.Title>Edit Weight</AlertDialog.Title>
                      <AlertDialog.Description>
                        Enter the default weight for this model ({model.name}).
                      </AlertDialog.Description>
                      <Input
                        keyboardType="numeric"
                        value={String(weight)}
                        onChangeText={handleWeightChange}
                        placeholder="Enter weight"
                        mt={10}
                        mb={15}
                      />
                      <XStack jc={'flex-end'} gap={'$3'} mt={'$3'}>
                        <AlertDialog.Cancel asChild>
                          <Button>Cancel</Button>
                        </AlertDialog.Cancel>
                        {/* Use AlertDialog.Action to handle the save and closing */}
                        {/* The onPress function should return boolean: true to close, false to keep open */}
                        <AlertDialog.Action asChild>
                          <Button onPress={handleSaveWeight} theme="accent">
                            Save
                          </Button>
                        </AlertDialog.Action>
                      </XStack>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog>
              </View>
            )}
          </XStack>

          <View style={styles.cardTextContainer}>
            {/* Ensure sufficient width for text */}
            <View width={'100%'} flexShrink={1}>
              {/* Use 100% and let flexShrink handle it with parent padding */}
              <Text
                style={styles.cardTitle}
                fontSize={14}
                fontWeight="bold"
                numberOfLines={1}
                textOverflow="ellipsis"
                ellipsizeMode="tail">
                {model.name}
              </Text>
            </View>
            {/* Display version info using displayedVersion */}
            {model.modelVersions && model.modelVersions.length > 1 && displayedVersion && (
              <Text style={styles.cardSubtitle} fontSize={10}>
                {/* Find the index of the displayed version for "Version X/Y" text */}
                Version {model.modelVersions.findIndex((v) => v.id === displayedVersion.id) + 1}/
                {model.modelVersions.length}
              </Text>
            )}
            {displayedVersion?.name && (
              <Text
                style={styles.cardSubtitle}
                fontSize={10}
                numberOfLines={1}
                ellipsizeMode="tail">
                {displayedVersion.name}
              </Text>
            )}
          </View>
        </Card>
      </TouchableOpacity>

      {/* Version Selection Dialog */}
      {/* Only render the dialog portal when open */}
      {isVersionDialogOpen && (
        <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
          <Dialog.Portal>
            <Dialog.Overlay
              key="overlay"
              animation="quick"
              opacity={0.5}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              elevate
              key="content"
              animation={['quick', { opacity: { overshootClamping: true } }]}
              enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
              exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
              x={0}
              scale={1}
              opacity={1}
              y={0}
              maxHeight="80%" // Limit height for scroll
              width="90%">
              <Dialog.Title>Select Version for {model.name}</Dialog.Title>
              <Dialog.Description>Choose a specific version for this model.</Dialog.Description>

              {/* List of Versions */}
              <ScrollView mt="$3" maxHeight={300} width="100%">
                {/* Limit height and ensure width */}
                <RadioGroup
                  aria-label={`Select version for ${model.name}`}
                  value={String(tempSelectedVersionId)}
                  onValueChange={(value) => setTempSelectedVersionId(value)}>
                  <YStack gap="$2">
                    {model.modelVersions?.map((version, index) => (
                      <XStack
                        key={version.id}
                        alignItems="center"
                        space="$2"
                        // Highlight selected item
                        backgroundColor={
                          String(tempSelectedVersionId) === String(version.id)
                            ? '$accent0'
                            : 'transparent'
                        }
                        padding="$2"
                        borderRadius="$2"
                        // Make the whole row tappable to select
                        onPress={() => setTempSelectedVersionId(String(version.id))}>
                        <RadioGroup.Item
                          value={String(version.id)}
                          id={`version-${model.id}-${version.id}`}>
                          <RadioGroup.Indicator />
                        </RadioGroup.Item>
                        <Label htmlFor={`version-${model.id}-${version.id}`} flex={1}>
                          {/* Label covers rest of the row */}
                          <YStack flex={1} flexShrink={1}>
                            {/* Ensure text wraps */}
                            <SizableText size="$3" numberOfLines={1}>
                              {version.name || `Version ${index + 1}`}
                            </SizableText>
                            {version.baseModel && (
                              <SizableText size="$1" color="$gray10" numberOfLines={1}>
                                Base: {renderbaseModelChip(version.baseModel)}
                              </SizableText>
                            )}
                            {version.trainedWords && version.trainedWords.length > 0 && (
                              <SizableText size="$1" color="$gray10" numberOfLines={1}>
                                Trigger: {version.trainedWords.join(', ')}
                              </SizableText>
                            )}
                          </YStack>
                        </Label>
                      </XStack>
                    ))}
                  </YStack>
                </RadioGroup>
              </ScrollView>

              <XStack jc={'flex-end'} gap={'$3'} mt={'$4'}>
                <Dialog.Close asChild>
                  <Button onPress={handleVersionDialogCancel}>Cancel</Button>
                </Dialog.Close>
                {/* Use a regular Button for Confirm inside Dialog, handle closing manually if needed after async */}
                <Button
                  onPress={handleVersionSelectConfirm}
                  theme="accent"
                  disabled={!tempSelectedVersionId} // Disable if no version is temp selected
                >
                  Confirm
                </Button>
              </XStack>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  cardButton: {
    width: '100%',
    aspectRatio: 4 / 6, // Adjust as needed for your layout
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    opacity: 0.9, // Slight opacity reduction when not selected
    borderWidth: 2, // Maintain border width
    borderColor: 'transparent', // Default transparent border
  },
  selectedCardButton: {
    opacity: 1, // Full opacity when selected
    // Border color is handled by the inline style using theme
  },
  card: {
    width: '100%',
    aspectRatio: 4 / 6, // Adjust as needed
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '$background', // Add a fallback background
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 4,
  },
  cardTitle: {
    color: 'white',
  },
  cardSubtitle: {
    color: 'white',
  },
});

export default ModelSelectItemCard;
