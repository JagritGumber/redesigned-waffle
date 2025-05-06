import React from 'react';
import { Card, Text, View, Image, XStack } from 'tamagui';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Model } from '~/types/civitai';
import { Link } from 'expo-router';
import { useModelStore } from '~/store/useModelStore'; // Adjust path
import { Chip } from './ui/Chip';
import { renderbaseModelChip } from '~/utils/renderBaseModelChip';

interface ModelCardProps {
  model: Model;
}

const ModelCard: React.FC<ModelCardProps> = ({ model }) => {
  const { setSelectedModel } = useModelStore();

  const handlePress = () => {
    setSelectedModel(model);
  };

  return (
    <Link
      href={{
        pathname: `/models/[id]`,
        params: {
          id: model.id,
        },
      }}
      asChild>
      <TouchableOpacity activeOpacity={0.8} style={styles.modelButton} onPress={handlePress}>
        <Card key={model.id} style={styles.modelCard} position="relative">
          {model.modelVersions &&
            model.modelVersions.length > 0 &&
            model.modelVersions[0].images &&
            model.modelVersions[0].images.length > 0 &&
            model.modelVersions[0].images[0].url && (
              <Image
                source={{ uri: model.modelVersions[0].images[0].url }}
                style={styles.modelImage}
                resizeMode="cover"
              />
            )}
          <XStack p={4} pos={'absolute'} gap={2}>
            <Chip size={'$2'} bg={'rgba(0, 0, 0, 0.5)'}>
              <Text>{model.type}</Text>
            </Chip>
            <Chip size={'$2'} bg={'rgba(0, 0, 0, 0.5)'}>
              <Text>{renderbaseModelChip(model.modelVersions.at(0)?.baseModel ?? null)}</Text>
            </Chip>
          </XStack>
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
          </View>
        </Card>
      </TouchableOpacity>
    </Link>
  );
};

const styles = StyleSheet.create({
  modelButton: {
    width: '100%',
    aspectRatio: 4 / 6, // Assuming desiredAspectRatio is 4/6
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  modelCard: {
    width: '100%',
    aspectRatio: 4 / 6, // Assuming desiredAspectRatio is 4/6
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  modelImage: {
    width: '100%',
    height: '100%',
  },
  cardTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 4,
    width: '100%',
  },
  cardTitle: {
    color: 'white',
  },
  cardSubtitle: {
    color: 'white',
  },
});

export default ModelCard;
