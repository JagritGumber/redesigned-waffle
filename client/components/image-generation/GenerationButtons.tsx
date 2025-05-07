// src/components/image-generation/GenerationButtons.tsx
import React from 'react';
import { Button, Text, Spinner } from 'tamagui';

interface GenerationButtonsProps {
  onTestGenerate: () => Promise<void>; // Define return type if async
  onBatchGenerate: () => Promise<void>; // Define return type if async
  isGenerating: boolean;
  canGenerate: boolean; // Derived in parent (e.g., requires checkpoint)
  numImages: string; // Use string as input value is string
}

const GenerationButtons: React.FC<GenerationButtonsProps> = React.memo(
  ({ onTestGenerate, onBatchGenerate, isGenerating, canGenerate, numImages }) => {
    console.log('Rendering GenerationButtons'); // Log render
    const batchSize = parseInt(numImages, 10);

    return (
      <>
        <Button marginTop={20} onPress={onTestGenerate} disabled={isGenerating || !canGenerate}>
          {isGenerating ? (
            <Spinner size="small" color="$color" />
          ) : (
            <Text>Test Generate (1 Image)</Text>
          )}
        </Button>
        <Button
          marginTop={10}
          onPress={onBatchGenerate}
          disabled={isGenerating || !canGenerate || batchSize <= 1 || batchSize > 8}>
          {isGenerating ? (
            <Spinner size="small" color="$color" />
          ) : (
            <Text>Batch Generate ({numImages || 1} Images)</Text>
          )}
        </Button>
      </>
    );
  }
);

export default GenerationButtons;
