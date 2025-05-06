import { useState } from 'react';
import { StyleSheet, TouchableOpacity, GestureResponderEvent, Alert } from 'react-native'; // Import Alert
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import { MoreHorizontal } from '@tamagui/lucide-icons';
import {
  View,
  Image,
  Text,
  Card,
  Dialog,
  Input,
  Button,
  XStack,
  useTheme,
  YStack,
  AlertDialog,
} from 'tamagui';
import { Chip } from './ui/Chip';
import { renderbaseModelChip } from '~/utils/renderBaseModelChip';

export interface ModelSelectItem extends CivitaiModelWithRelations {}

interface ModelSelectItemCardProps {
  model: ModelSelectItem;
  isSelected?: boolean;
  onPress?: (model: ModelSelectItem) => void;
}

// Helper to get the abbreviation for the model type chip
const getModelTypeAbbreviation = (type: string | undefined) => {
  if (!type) return '';
  switch (
    type?.toLowerCase().split(' ').join('') // Added optional chaining here
  ) {
    case 'checkpoint':
      return 'CK';
    case 'textualinversion':
      return 'TI';
    case 'controlnet':
      return 'CN';
    case 'pose':
      return 'Pose'; // Or 'POS' if preferred
    case 'hypernetwork':
      return 'HN';
    case 'lora':
      return 'LoRA';
    case 'aestheticgradient':
      return 'AG';
    default:
      return type; // Fallback to the full type name
  }
};

const ModelSelectItemCard: React.FC<ModelSelectItemCardProps> = ({
  model,
  isSelected,
  onPress,
  // onVersionChange, // If you added the prop
}) => {
  // console.log('Rendering Card:', model.id, 'isSelected:', isSelected);
  const [weight, setWeight] = useState<number | string>(model.defaultWeight ?? '');
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const theme = useTheme(); // useTheme hook is called correctly

  // Determine the currently displayed version
  const currentVersion = model.modelVersions?.[currentVersionIndex];

  const handlePressCard = () => {
    console.log('ModelSelectItemCard pressed:', model.id, 'Current isSelected:', isSelected);
    if (model.modelVersions && model.modelVersions.length > 1) {
      setCurrentVersionIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % model.modelVersions.length;
        return nextIndex;
      });
    }

    onPress?.(model);
  };

  const handleEditWeight = (event: GestureResponderEvent) => {
    event.stopPropagation();
  };

  const handleWeightChange = (newWeight: string) => {
    setWeight(newWeight);
  };

  const handleSaveWeight = async (e: GestureResponderEvent) => {
    console.log('Saving weight for:', model.id, 'New weight:', weight);
    // IMPORTANT: Stop propagation here on the save button to prevent the Dialog.Close
    // from potentially interfering if it triggers on the same event phase.
    // However, Tamagui's Dialog.Close usually handles this correctly.
    // e.stopPropagation(); // Keeping this might be safer if onClose is also triggered

    const weightValue = Number(weight);
    if (isNaN(weightValue)) {
      console.error('Invalid weight value:', weight);
      Alert.alert('Invalid Input', 'Please enter a valid number for weight.');
      return;
    }

    // Ensure backend URL is configured
    if (!process.env.EXPO_PUBLIC_BACKEND_URL) {
      console.error('Backend URL is not configured.');
      Alert.alert('Configuration Error', 'Backend URL is not configured.');
      return;
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
        const data = await response.json();
        console.log('Weight updated successfully:', data);
        // Alert.alert('Success', 'Weight saved successfully.'); // Avoid Alert immediately before closing dialog
        // Optional: You might want to refetch the model data or update the store
        // to reflect the saved weight change globally if needed.
        // You might want to close the dialog here or let the Dialog.Close handle it
      } else {
        const errorData = await response.json();
        console.error('Failed to update weight:', response.status, errorData);
        Alert.alert('Update Failed', errorData.message || 'Could not save weight.');
      }
    } catch (error) {
      console.error('Error updating weight:', error);
      Alert.alert('Error', 'An error occurred while saving weight.');
    }
    // Let the Dialog.Close asChild handle the dialog closing
  };

  // Only render if model and versions exist
  if (!model || !model.modelVersions || model.modelVersions.length === 0) {
    // console.warn('Model card not rendering due to missing data:', model?.id);
    return null;
  }

  // Potential fix: Change Dialog.Overlay background to a standard Tamagui token
  // like "$overlayArea", which is typically semi-transparent,
  // instead of potentially opaque "$shadow6".
  // Also, removing the stopPropagation from handleEditWeight as it's on the Dialog.Trigger.

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.cardButton,
          isSelected && styles.selectedCardButton,
          isSelected && {
            borderColor: theme.accent10.get(), // This requires theme.accent10 to exist
          },
        ]}
        onPress={handlePressCard}>
        <Card key={model.id} style={styles.card}>
          {/* Display image from the current version */}
          {currentVersion?.images?.[0]?.url && (
            <Image
              source={{ uri: currentVersion.images[0].url }}
              style={styles.cardImage}
              objectFit="cover"
            />
          )}

          <XStack p={4} pos={'absolute'} top={0} left={0} right={0} gap={2} zIndex={1}>
            <Chip size={'$2'} bg={'rgba(0, 0, 0, 0.5)'} w={'fit-content'}>
              <Text color="white">{getModelTypeAbbreviation(model.type)}</Text>
            </Chip>
            {currentVersion?.baseModel && (
              <Chip size={'$2'} bg={'rgba(0, 0, 0, 0.5)'} w={'fit-content'}>
                <Text color="white">{renderbaseModelChip(currentVersion.baseModel)}</Text>
              </Chip>
            )}
            <View position="absolute" top={0} right={0} p={4} zIndex={2}>
              <AlertDialog>
                <AlertDialog.Trigger asChild>
                  {/* Call handleEditWeight if needed for debugging, but it shouldn't stop propagation here */}
                  <Button size={'$1'} onPress={handleEditWeight}>
                    <MoreHorizontal size={20} color={isSelected ? '$accent10' : '$accent0'} />
                  </Button>
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
                    animation={[
                      'quick',
                      {
                        opacity: {
                          overshootClamping: true,
                        },
                      },
                    ]}
                    enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
                    exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
                    x={0}
                    scale={1}
                    opacity={1}
                    y={0}>
                    <AlertDialog.Title>Edit Weight</AlertDialog.Title>
                    <AlertDialog.Description>
                      Enter the weight for {model.name}.
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
          </XStack>

          {/* Text Container */}
          <View style={styles.cardTextContainer}>
            <View width={'calc(100% - 6rem)'} flexShrink={1}>
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
            {model.modelVersions && model.modelVersions.length > 1 && (
              <Text style={styles.cardSubtitle} fontSize={12}>
                Version {currentVersionIndex + 1}/{model.modelVersions.length}
              </Text>
            )}
            {currentVersion?.name && (
              <Text
                style={styles.cardSubtitle}
                fontSize={10}
                numberOfLines={1}
                ellipsizeMode="tail">
                {currentVersion.name}
              </Text>
            )}
          </View>
        </Card>
      </TouchableOpacity>
    </>
  );
};

const styles = StyleSheet.create({
  cardButton: {
    width: '100%',
    aspectRatio: 4 / 6, // Adjust as needed
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    opacity: 0.9, // Slight opacity reduction when not selected
    borderWidth: 2, // Maintain border width
    borderColor: 'transparent', // Default transparent border
  },
  selectedCardButton: {
    opacity: 1, // Full opacity when selected
    // Border color is handled by the inline style
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
