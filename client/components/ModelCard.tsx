import React from 'react';
import { Card, Text, View, Image } from 'tamagui';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Model } from '~/types/civitai';
import { Link } from 'expo-router';
import { useModelStore } from '~/store/useModalStore'; // Adjust path

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
        <Card key={model.id} style={styles.modelCard}>
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
          <View style={styles.cardTextContainer}>
            <Text
              style={styles.cardTitle}
              fontSize={14}
              fontWeight="bold"
              numberOfLines={2}
              ellipsizeMode="tail">
              {model.name}
            </Text>
            <Text style={styles.cardSubtitle} fontSize={10} color="white">
              Type: {model.type}
            </Text>
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
    padding: 8,
  },
  cardTitle: {
    color: 'white',
  },
  cardSubtitle: {
    color: 'white',
  },
});

export default ModelCard;
