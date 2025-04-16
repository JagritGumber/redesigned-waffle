import { useState, useEffect, useCallback } from 'react';
import { Dimensions } from 'react-native';
import { Text, Input, Button, Select, Checkbox, Theme, Image, View, ScrollView, XStack } from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models'; // Adjust path if needed
import ModelSelectList from './ModelSelectList'; // Adjust path if needed
import { ASPECT_RATIOS } from '~/constants/generation'; // Assuming this constant exists

const ImageGenerationScreen = () => {
  const [checkpoints, setCheckpoints] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CivitaiModelWithRelations | null>(
    null
  );
  const [loras, setLoras] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<string[]>([]);
  const [textualInversions, setTextualInversions] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedTextualInversions, setSelectedTextualInversions] = useState<string[]>([]);
  const [hypernetworks, setHypernetworks] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedHypernetworks, setSelectedHypernetworks] = useState<string[]>([]);
  const [aestheticGradients, setAestheticGradients] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedAestheticGradients, setSelectedAestheticGradients] = useState<string[]>([]);
  const [controlnets, setControlnets] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedControlnets, setSelectedControlnets] = useState<string[]>([]);
  const [poses, setPoses] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedPose, setSelectedPose] = useState<CivitaiModelWithRelations | null>(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState('512');
  const [height, setHeight] = useState('512');
  const [numImages, setNumImages] = useState('1');
  const [seed, setSeed] = useState('');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [checkpointColumns, setCheckpointColumns] = useState<number>(4);
  const [loraColumns, setLoraColumns] = useState<number>(4);
  const [otherModelColumns, setOtherModelColumns] = useState<number>(4);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | 'custom'>('1024*1024'); // Default ratio
  const [useCustomRatio, setUseCustomRatio] = useState(false);

  const fetchModels = useCallback(
    async (
      type: string,
      setter: React.Dispatch<React.SetStateAction<CivitaiModelWithRelations[]>>
    ) => {
      try {
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${type.toLowerCase().replace(/ /g, '-')}`
        );
        if (!response.ok) {
          console.error(`Failed to fetch ${type}:`, response.status);
          return;
        }
        const data = await response.json();
        setter(data.models);
      } catch (error) {
        console.error(`Error fetching ${type}:`, error);
      }
    },
    []
  );

  useEffect(() => {
    fetchModels('checkpoints', setCheckpoints);
    fetchModels('loras', setLoras);
    fetchModels('textual-inversions', setTextualInversions);
    fetchModels('hypernetworks', setHypernetworks);
    fetchModels('aesthetic-gradients', setAestheticGradients);
    fetchModels('controlnets', setControlnets);
    fetchModels('poses', setPoses);

    const intervalId = setInterval(() => {
      fetchModels('checkpoints', setCheckpoints);
      fetchModels('loras', setLoras);
      fetchModels('textual-inversions', setTextualInversions);
      fetchModels('hypernetworks', setHypernetworks);
      fetchModels('aesthetic-gradients', setAestheticGradients);
      fetchModels('controlnets', setControlnets);
      fetchModels('poses', setPoses);
    }, 10_000);

    return () => clearInterval(intervalId);
  }, [fetchModels]);

  useEffect(() => {
    const updateColumns = () => {
      const width = Dimensions.get('window').width;
      const baseColumns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
      setCheckpointColumns(baseColumns);
      setLoraColumns(baseColumns);
      setOtherModelColumns(baseColumns);
    };

    Dimensions.addEventListener('change', updateColumns);
    updateColumns();
  }, []);

  const handleCheckpointPress = useCallback((checkpoint: CivitaiModelWithRelations) => {
    setSelectedCheckpoint(checkpoint);
  }, []);

  const handleLoraSelect = useCallback((loraId: string | number) => {
    setSelectedLoras((prev) =>
      prev.includes(loraId.toString())
        ? prev.filter((id) => id !== loraId.toString())
        : prev.length < 6
          ? [...prev, loraId.toString()]
          : (alert('You can only select up to 6 LoRAs.'), prev)
    );
  }, []);

  const handleTextualInversionSelect = useCallback((id: string | number) => {
    setSelectedTextualInversions((prev) =>
      prev.includes(id.toString())
        ? prev.filter((itemId) => itemId !== id.toString())
        : [...prev, id.toString()]
    );
  }, []);

  const handleHypernetworkSelect = useCallback((id: string | number) => {
    setSelectedHypernetworks((prev) =>
      prev.includes(id.toString())
        ? prev.filter((itemId) => itemId !== id.toString())
        : [...prev, id.toString()]
    );
  }, []);

  const handleAestheticGradientSelect = useCallback((id: string | number) => {
    setSelectedAestheticGradients((prev) =>
      prev.includes(id.toString())
        ? prev.filter((itemId) => itemId !== id.toString())
        : [...prev, id.toString()]
    );
  }, []);

  const handleControlnetSelect = useCallback((id: string | number) => {
    setSelectedControlnets((prev) =>
      prev.includes(id.toString())
        ? prev.filter((itemId) => itemId !== id.toString())
        : [...prev, id.toString()]
    );
  }, []);

  const handlePosePress = useCallback((pose: CivitaiModelWithRelations) => {
    setSelectedPose((prevSelectedPose) => {
      if (prevSelectedPose && prevSelectedPose.id === pose.id) {
        return null; // Deselect if the same pose is pressed again
      } else {
        return pose; // Select the new pose
      }
    });
  }, []);

  const handleAspectRatioSelect = (ratio: string) => {
    setSelectedAspectRatio(ratio);
    setUseCustomRatio(false);
    const [w, h] = ratio.split('*').map(Number);
    setWidth(String(w));
    setHeight(String(h));
  };

  const handleCustomRatioSelect = () => {
    setSelectedAspectRatio('custom');
    setUseCustomRatio(true);
  };

  const handleTestGenerate = () => {
    if (!selectedCheckpoint) {
      alert('Please select a checkpoint.');
      return;
    }
    setIsGenerating(true);
    setGeneratedImage(null);
    const payload = {
      checkpointName: selectedCheckpoint.name,
      loraNames: selectedLoras.map(
        (id) => loras.find((lora) => lora.id.toString() === id)?.name || ''
      ),
      textualInversionNames: selectedTextualInversions.map(
        (id) => textualInversions.find((ti) => ti.id.toString() === id)?.name || ''
      ),
      hypernetworkNames: selectedHypernetworks.map(
        (id) => hypernetworks.find((hn) => hn.id.toString() === id)?.name || ''
      ),
      aestheticGradientNames: selectedAestheticGradients.map(
        (id) => aestheticGradients.find((ag) => ag.id.toString() === id)?.name || ''
      ),
      controlnetNames: selectedControlnets.map(
        (id) => controlnets.find((cn) => cn.id.toString() === id)?.name || ''
      ),
      poseName: selectedPose?.name || '',
      prompt,
      negativePrompt,
      width: parseInt(width),
      height: parseInt(height),
      numImages: 1,
      seed: seed || Math.floor(Math.random() * 1000000),
    };

    fetch('/api/v1/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .then((data) => {
        setIsGenerating(false);
        setGeneratedImage(data.imageUrl || data.imageData);
        console.log('Test image generated:', data);
      })
      .catch((error) => {
        setIsGenerating(false);
        console.error('Error generating test image:', error);
        alert('Failed to generate image.');
      });
  };

  const handleBatchGenerate = () => {
    if (!selectedCheckpoint) {
      alert('Please select a checkpoint.');
      return;
    }
    setIsGenerating(true);
    const payload = {
      checkpointName: selectedCheckpoint.name,
      loraNames: selectedLoras.map(
        (id) => loras.find((lora) => lora.id.toString() === id)?.name || ''
      ),
      textualInversionNames: selectedTextualInversions.map(
        (id) => textualInversions.find((ti) => ti.id.toString() === id)?.name || ''
      ),
      hypernetworkNames: selectedHypernetworks.map(
        (id) => hypernetworks.find((hn) => hn.id.toString() === id)?.name || ''
      ),
      aestheticGradientNames: selectedAestheticGradients.map(
        (id) => aestheticGradients.find((ag) => ag.id.toString() === id)?.name || ''
      ),
      controlnetNames: selectedControlnets.map(
        (id) => controlnets.find((cn) => cn.id.toString() === id)?.name || ''
      ),
      poseName: selectedPose?.name || '',
      prompt,
      negativePrompt,
      width: parseInt(width),
      height: parseInt(height),
      numImages: parseInt(numImages),
    };

    fetch('/api/v1/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .then((data) => {
        setIsGenerating(false);
        console.log('Batch generation started:', data);
        alert(`Batch generation started. Job ID: ${data.jobId}`);
      })
      .catch((error) => {
        setIsGenerating(false);
        console.error('Error starting batch generation:', error);
        alert('Failed to start batch generation.');
      });
  };

  return (
    <ScrollView flex={1} padding={16} bg={"$background"} >
      <Text fontWeight="bold" fontSize={16} marginBottom={5}>
        Select Checkpoint (Required):
      </Text>
      <ModelSelectList
        numColumns={checkpointColumns}
        models={checkpoints}
        selectedModelId={selectedCheckpoint?.id}
        onModelPress={handleCheckpointPress}
      />

      {loras.length > 0 && (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select LoRAs (Max 6):
          </Text>
          <ModelSelectList
            numColumns={loraColumns}
            models={loras}
            selectedModelIds={selectedLoras}
            onModelSelect={handleLoraSelect}
          />
        </>
      )}

      {textualInversions.length > 0 && (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Textual Inversions:
          </Text>
          <ModelSelectList
            numColumns={otherModelColumns}
            models={textualInversions}
            selectedModelIds={selectedTextualInversions}
            onModelSelect={handleTextualInversionSelect}
          />
        </>
      )}

      {hypernetworks.length > 0 && (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Hypernetworks:
          </Text>
          <ModelSelectList
            numColumns={otherModelColumns}
            models={hypernetworks}
            selectedModelIds={selectedHypernetworks}
            onModelSelect={handleHypernetworkSelect}
          />
        </>
      )}

      {aestheticGradients.length > 0 && (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Aesthetic Gradients:
          </Text>
          <ModelSelectList
            numColumns={otherModelColumns}
            models={aestheticGradients}
            selectedModelIds={selectedAestheticGradients}
            onModelSelect={handleAestheticGradientSelect}
          />
        </>
      )}

      {controlnets.length > 0 && (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Controlnets:
          </Text>
          <ModelSelectList
            numColumns={otherModelColumns}
            models={controlnets}
            selectedModelIds={selectedControlnets}
            onModelSelect={handleControlnetSelect}
          />
        </>
      )}

      {poses.length > 0 && (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Pose:
          </Text>
          <ModelSelectList
            numColumns={otherModelColumns}
            models={poses}
            selectedModelId={selectedPose?.id}
            onModelPress={handlePosePress}
          />
        </>
      )}

      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Aspect Ratio:
      </Text>
      <View flexDirection="row" flexWrap="wrap" gap={8} marginTop={8}>
        {[...ASPECT_RATIOS, 'Custom'].map((ratio) => (
          <Button
            key={ratio}
            size="$3"
            borderRadius={16}
            backgroundColor={selectedAspectRatio === ratio ? '$accent10' : '$accent0'}
            color={selectedAspectRatio === ratio ? '$accent12' : '$accent1'}
            onPress={() =>
              ratio === 'Custom' ? handleCustomRatioSelect() : handleAspectRatioSelect(ratio)
            }
          >
            {ratio}
          </Button>
        ))}
      </View>

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

      {/* Rest of your component (Prompt, Negative Prompt, etc.) */}
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Prompt:
      </Text>
      <Input
        multiline
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Enter your prompt"
        size="md"
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
      />

      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Number of Images (for Batch):
      </Text>
      <Input value={numImages} onChangeText={setNumImages} keyboardType="numeric" size="md" />

      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Seed (Optional):
      </Text>
      <Input value={seed} onChangeText={setSeed} keyboardType="numeric" size="md" />

      <Button marginTop={20} onPress={handleTestGenerate} disabled={isGenerating}>
        Test Generate
      </Button>
      <Button marginTop={10} onPress={handleBatchGenerate} disabled={isGenerating}>
        Batch Generate
      </Button>

      {isGenerating && (
        <Text marginTop={10} color="$blue5">
          Generating...
        </Text>
      )}
      {generatedImage && (
        <View marginTop={10}>
          <Text>Generated Image:</Text>
          <Image source={{ uri: generatedImage }} width={256} height={256} resizeMode="contain" marginTop={8} />
        </View>
      )}
    </ScrollView>
  );
};

export default ImageGenerationScreen;
