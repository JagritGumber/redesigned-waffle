// components/ImageCard.tsx
import React from 'react';
import { Card, Text, View, Image } from 'tamagui';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { SelectGeneratorJob } from '~/backend/schema';

import { Link } from 'expo-router';

interface ImageCardProps {
  image: SelectGeneratorJob;
}

const ImageCard: React.FC<ImageCardProps> = ({ image }) => {
  if (!image.imageKey) {
    return null;
  }
  const imageUrl = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/images/${encodeURIComponent(image.imageKey)}`;

  if (!imageUrl) {
    console.warn('Image key is missing for item:', image);
    return null;
  }

  return (
    <Link
      href={{
        pathname: `/gallery/[id]`,
        params: {
          id: image.id,
        },
      }}
      asChild>
      {/* TouchableOpacity needs width 100% to fill its parent wrapper View */}
      {/* Its height will be determined by its child (Card) */}
      <TouchableOpacity activeOpacity={0.8} style={styles.imageButton}>
        {/* Card now defines the aspectRatio based on its width */}
        <Card key={image.imageKey} style={styles.imageCard} position="relative">
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        </Card>
      </TouchableOpacity>
    </Link>
  );
};

const styles = StyleSheet.create({
  imageButton: {
    width: '100%',
    // Removed aspectRatio and height: '100%' - height is now determined by child (Card)
    borderRadius: 8, // Keep border radius on the clickable area
    overflow: 'hidden', // Important for radius
  },
  imageCard: {
    width: '100%',
    // Removed height: '100%'
    aspectRatio: 1 / 1, // Moved aspectRatio here
    borderRadius: 8, // Keep border radius consistent
    overflow: 'hidden', // Important for radius
    padding: 0,
    margin: 0,
  },
  image: {
    width: '100%',
    height: '100%', // Image fills the Card (which has the aspect ratio)
    overflow: 'hidden',
  },
});

export default ImageCard;
