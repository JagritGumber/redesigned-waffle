// src/components/image-generation/DimensionsInput.tsx
import React from 'react';
import { Text, Input, XStack, YStack, Button } from 'tamagui';
import useGenerationStore from '~/store/useGenerationStore'; // Import the store
import { ASPECT_RATIOS } from '~/constants/generation';

interface DimensionsInputProps {
  aspectRatios: string[]; // Pass the constant as a prop
}

const DimensionsInput: React.FC<DimensionsInputProps> = React.memo(({ aspectRatios }) => {
  console.log('Rendering DimensionsInput'); // Log render
  const {
    width,
    setWidth,
    height,
    setHeight,
    selectedAspectRatio,
    setSelectedAspectRatio,
    useCustomRatio,
    setUseCustomRatio,
  } = useGenerationStore(
    // Use selectors to only re-render when these specific values change
    (state) => ({
      width: state.width,
      setWidth: state.setWidth,
      height: state.height,
      setHeight: state.setHeight,
      selectedAspectRatio: state.selectedAspectRatio,
      setSelectedAspectRatio: state.setSelectedAspectRatio,
      useCustomRatio: state.useCustomRatio,
      setUseCustomRatio: state.setUseCustomRatio,
    })
  );

  // Memoize handlers that interact with the store
  const handleAspectRatioSelect = React.useCallback(
    (ratio: string) => {
      setSelectedAspectRatio(ratio);
      setUseCustomRatio(false);
      const [w, h] = ratio.split('*').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        setWidth(String(w));
        setHeight(String(h));
      }
    },
    [setSelectedAspectRatio, setUseCustomRatio, setWidth, setHeight]
  );

  const handleCustomRatioSelect = React.useCallback(() => {
    setSelectedAspectRatio('custom');
    setUseCustomRatio(true);
  }, [setSelectedAspectRatio, setUseCustomRatio]);

  return (
    <>
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Aspect Ratio:
      </Text>
      <XStack flexWrap="wrap" gap={8} marginTop={8}>
        {[...aspectRatios, 'Custom'].map((ratio) => (
          <Button
            key={ratio}
            size="$2"
            borderRadius={16}
            backgroundColor={selectedAspectRatio === ratio ? '$accent10' : '$accent0'}
            color={selectedAspectRatio === ratio ? '$accent12' : '$accent1'}
            onPress={() =>
              ratio === 'Custom' ? handleCustomRatioSelect() : handleAspectRatioSelect(ratio)
            }>
            {ratio}
          </Button>
        ))}
      </XStack>
      {useCustomRatio && (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Custom Width:
          </Text>
          <Input value={width} onChangeText={setWidth} keyboardType="numeric" size="md" />

          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Custom Height:
          </Text>
          <Input value={height} onChangeText={setHeight} keyboardType="numeric" size="md" />
        </>
      )}
    </>
  );
});

export default DimensionsInput;
