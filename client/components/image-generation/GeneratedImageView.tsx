// src/components/image-generation/GeneratedImageView.tsx
import React from 'react';
import { YStack, Text, Image } from 'tamagui';

interface GeneratedImageViewProps {
  imageUrl: string | null;
  width: string; // Pass dimensions for aspect ratio
  height: string;
}

const GeneratedImageView: React.FC<GeneratedImageViewProps> = React.memo(
  ({ imageUrl, width, height }) => {
    console.log('Rendering GeneratedImageView'); // Log render
    if (!imageUrl) {
      return null;
    }

    // Calculate aspect ratio dynamically
    const aspectRatio = (parseInt(width, 10) || 1) / (parseInt(height, 10) || 1);

    return (
      <YStack marginTop={20} alignItems="center">
        <Text fontWeight="bold" fontSize={16} marginBottom={8}>
          Generated Image (Test):
        </Text>
        <Image
          source={{ uri: imageUrl }}
          maxWidth="100%"
          maxHeight={400}
          flexGrow={1}
          flexShrink={1}
          resizeMode="contain"
          style={{ aspectRatio: aspectRatio }}
        />
      </YStack>
    );
  }
);

export default GeneratedImageView;
