// src/components/image-generation/PromptInput.tsx
import React from 'react';
import { Text, Input } from 'tamagui';
import useGenerationStore from '~/store/useGenerationStore'; // Import the store

const PromptInput: React.FC = React.memo(() => {
  console.log('Rendering PromptInput'); // Log render
  const { prompt, setPrompt, negativePrompt, setNegativePrompt } = useGenerationStore(
    // Use selectors
    (state) => ({
      prompt: state.prompt,
      setPrompt: state.setPrompt,
      negativePrompt: state.negativePrompt,
      setNegativePrompt: state.setNegativePrompt,
    })
  );

  // No need for useCallback on simple setters

  return (
    <>
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Prompt:
      </Text>
      <Input
        multiline
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Enter your prompt"
        size="md"
        numberOfLines={3}
        minHeight={60}
      />

      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Negative Prompt (Optional):
      </Text>
      <Input
        multiline
        value={negativePrompt}
        onChangeText={setNegativePrompt}
        placeholder="Enter negative prompt (optional)"
        size="md"
        numberOfLines={3}
        minHeight={60}
      />
    </>
  );
});

export default PromptInput;
