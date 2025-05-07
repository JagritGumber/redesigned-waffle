// src/components/image-generation/SeedInput.tsx
import React from 'react';
import { Text, Input, XStack, Checkbox, Label, SizableText } from 'tamagui';
import useGenerationStore from '~/store/useGenerationStore'; // Import the store

const SeedInput: React.FC = React.memo(() => {
  console.log('Rendering SeedInput'); // Log render
  const { seed, setSeed, useRandomSeed, setUseRandomSeed } = useGenerationStore(
    // Use selectors
    (state) => ({
      seed: state.seed,
      setSeed: state.setSeed,
      useRandomSeed: state.useRandomSeed,
      setUseRandomSeed: state.setUseRandomSeed,
    })
  );

  // No need for useCallback on simple setters

  return (
    <>
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Seed:
      </Text>
      <XStack alignItems="center" space="$3">
        <Input
          flex={1}
          value={seed}
          onChangeText={setSeed}
          keyboardType="numeric"
          size="md"
          disabled={useRandomSeed}
          opacity={useRandomSeed ? 0.5 : 1}
        />
        <XStack alignItems="center" space="$1">
          <Checkbox
            id="randomSeedCheckbox"
            checked={useRandomSeed}
            onCheckedChange={(checked) => setUseRandomSeed(!!checked)}
            size="$4">
            <Checkbox.Indicator />
          </Checkbox>
          <Label htmlFor="randomSeedCheckbox">Random</Label>
        </XStack>
      </XStack>
    </>
  );
});

export default SeedInput;
