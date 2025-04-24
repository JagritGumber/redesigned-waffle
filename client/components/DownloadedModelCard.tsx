import React from 'react';
import { Card, Text, View, Image } from 'tamagui';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { useModelStore } from '~/store/useModelStore'; // Adjust path
import { CivitaiModelWithRelations } from '~/backend/schema/models';

interface DownloadedModelCardProps {
  model: CivitaiModelWithRelations;
}

const DownloadedModelCard: React.FC<DownloadedModelCardProps> = ({ model }) => {
  const handlePress = () => {};

  return (
    <Link
      href={{
        pathname: `/models/[id]`,
        params: {
          id: model.civitaiId,
        },
      }}
      asChild>
      <TouchableOpacity activeOpacity={0.8} style={styles.modelButton} onPress={handlePress}>
        <Card key={model.id} style={styles.modelCard}>
          {model.versions &&
            model.versions.length > 0 &&
            model.versions[0].images &&
            model.versions[0].images.length > 0 &&
            model.versions[0].images[0].url && (
              <Image
                source={{ uri: model.versions[0].images[0].url }}
                style={styles.modelImage}
                objectFit="cover"
              />
            )}
          <View style={styles.cardTextContainer}>
            <View>
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
            <View
              right={'$2'}
              bg={'$background08'}
              p={'$1'}
              px={'$2'}
              br={'$5'}
              ai={'center'}
              jc={'center'}>
              <Text>{model.versions?.[0]?.baseModel}</Text>
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
    padding: 8,
  },
  cardTitle: {
    color: 'white',
  },
  cardSubtitle: {
    color: 'white',
  },
});

export default DownloadedModelCard;
