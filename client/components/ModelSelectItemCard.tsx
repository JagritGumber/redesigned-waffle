import { useState } from 'react';
import { StyleSheet, TouchableOpacity, GestureResponderEvent } from 'react-native';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import { MoreVertical } from '@tamagui/lucide-icons';
import { View, Image, Text, Card, Dialog, Input, Button, XStack, useTheme } from 'tamagui';

export interface ModelSelectItem extends CivitaiModelWithRelations { }

interface ModelSelectItemCardProps {
  model: ModelSelectItem;
  isSelected?: boolean;
  onPress?: (model: ModelSelectItem) => void;
}

const ModelSelectItemCard: React.FC<ModelSelectItemCardProps> = ({
  model,
  isSelected,
  onPress,
}) => {
  const [weight, setWeight] = useState<number | string>(model.defaultWeight!); // Default weight
  const theme = useTheme();

  const handleEditWeight = (event: GestureResponderEvent) => {
    event.stopPropagation(); // Prevent card selection
  };

  const handleCloseModal = (e: GestureResponderEvent) => {
    e.stopPropagation();
  };

  const handleWeightChange = (newWeight: number | string) => {
    setWeight(newWeight);
  };

  const handleSaveWeight = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${model.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ defaultWeight: Number(weight) }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('Weight updated successfully:', data);
        // Optionally, you might want to update the local model data
      } else {
        const errorData = await response.json();
        console.error('Failed to update weight:', errorData);
        // Optionally, display an error message to the user
      }
    } catch (error) {
      console.error('Error updating weight:', error);
      // Optionally, display an error message to the user
    }
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.cardButton, isSelected && styles.selectedCardButton, isSelected && {
          borderColor: theme.accent10.get()
        }]}
        onPress={() => onPress?.(model)}
      >
        <Card key={model.id} style={styles.card}>
          {model.versions?.[0]?.images?.[0]?.url && (
            <Image
              source={{ uri: model.versions[0].images[0].url }}
              style={styles.cardImage}
              objectFit="cover"
            />
          )}
          <View style={styles.iconContainer}>
            <Dialog modal>
              <Dialog.Trigger asChild>
                <Button onPress={handleEditWeight} padding={8}>
                  <MoreVertical size={20} color={isSelected ? '$accent10' : "$accent0"} />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay
                  key="overlay"
                  backgroundColor={theme.shadow6.get()}
                  enterStyle={{ opacity: 0 }}
                  exitStyle={{ opacity: 0 }}
                />
                <Dialog.Content padding={20}>
                  <Dialog.Title>Edit Weight</Dialog.Title>
                  <Dialog.Description>Enter the weight for {model.name}.</Dialog.Description>
                  <Input
                    keyboardType="numeric"
                    value={String(weight)}
                    onChangeText={handleWeightChange}
                    placeholder="Enter weight"
                    mt={10}
                    mb={15}
                  />
                  <XStack jc={'flex-end'} gap={'$3'} mt={'$3'}>
                    <Dialog.Close asChild>
                      <Button onPress={handleCloseModal}>Cancel</Button>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <Button onPress={handleSaveWeight}>Save</Button>
                    </Dialog.Close>
                  </XStack>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog>
          </View>
          <View style={styles.cardTextContainer}>
            <Text
              style={[styles.cardTitle, isSelected && styles.selectedCardTitle]}
              fontSize={14}
              fontWeight="bold"
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {model.name}
            </Text>
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
    opacity: 0.7,
  },
  selectedCardButton: {
    opacity: 1,
    borderWidth: 2,
    borderColor: "$accent10",
  },
  card: {
    width: '100%',
    aspectRatio: 4 / 6, // Adjust as needed
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
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
    padding: 8,
  },
  cardTitle: {
    color: 'white',
  },
  selectedCardTitle: {
    color: '$blue3',
  },
  iconContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2, // Increased zIndex to ensure it's on top
  },
  editButton: {
    padding: 8,
  },
  dialogContent: {
    padding: 20,
  },
  weightInput: {
    marginTop: 10,
    marginBottom: 15,
  },
});

export default ModelSelectItemCard;
