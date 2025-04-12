import { Check, ChevronDown } from '@tamagui/lucide-icons';
import { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Text, Input, Button, Select, Checkbox, Theme, Image, View } from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models';

const { width: screenWidth } = Dimensions.get('window');
const checkpointCardWidth = (screenWidth - 48) / 2; // Two columns with some margin

const ImageGenerationScreen = () => {
  const [checkpoints, setCheckpoints] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CivitaiModelWithRelations | null>(
    null
  );
  const [loras, setLoras] = useState<CivitaiModelWithRelations[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState('512');
  const [height, setHeight] = useState('512');
  const [numImages, setNumImages] = useState('1');
  const [seed, setSeed] = useState('');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    // Fetch checkpoints from backend API (/api/v1/models/checkpoints)
    fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/checkpoints`)
      .then((response) => response.json())
      .then((data) => setCheckpoints(data.models))
      .catch((error) => console.error('Error fetching checkpoints:', error));

    // Fetch loras from backend API (/api/v1/models/loras)
    fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/loras`)
      .then((response) => response.json())
      .then((data) => setLoras(data.models))
      .catch((error) => console.error('Error fetching loras:', error));
  }, []);

  const handleTestGenerate = () => {
    if (!selectedCheckpoint) {
      alert('Please select a checkpoint.');
      return;
    }
    setIsGenerating(true);
    setGeneratedImage(null);
    const payload = {
      checkpointName: selectedCheckpoint.name,
      loraNames: selectedLoras.map((id) => loras.find((lora) => lora.id === id)?.name || ''),
      prompt,
      negativePrompt,
      width: parseInt(width),
      height: parseInt(height),
      numImages: 1,
      seed: seed || Math.floor(Math.random() * 1000000),
      // Add other generation parameters here
    };

    fetch('/api/v1/generate-image', {
      // Backend API endpoint to be created
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      loraNames: selectedLoras.map((id) => loras.find((lora) => lora.id === id)?.name || ''),
      prompt,
      negativePrompt,
      width: parseInt(width),
      height: parseInt(height),
      numImages: parseInt(numImages),
      // You might want to handle seed generation differently for batches
      // seed: seed || Math.floor(Math.random() * 1000000),
      // Add other generation parameters here
    };

    fetch('/api/v1/generate-image', {
      // Backend API endpoint to be created
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .then((data) => {
        setIsGenerating(false);
        console.log('Batch generation started:', data);
        alert(`Batch generation started. Job ID: ${data.jobId}`);
        // You'll need to implement a way to view the generated images later (e.g., in a gallery)
      })
      .catch((error) => {
        setIsGenerating(false);
        console.error('Error starting batch generation:', error);
        alert('Failed to start batch generation.');
      });
  };

  return (
    <Theme>
      <ScrollView style={styles.container}>
        <Text fontWeight="bold" fontSize={16} marginBottom={5}>
          Select Checkpoint (Required):
        </Text>
        <View style={styles.checkpointContainer}>
          {checkpoints.map((checkpoint) => (
            <TouchableOpacity
              key={checkpoint.id}
              style={[
                styles.checkpointCard,
                selectedCheckpoint?.id === checkpoint.id && styles.selectedCheckpoint,
              ]}
              onPress={() => setSelectedCheckpoint(checkpoint)}>
              {checkpoint.versions?.[0].images?.[0]?.url && (
                <Image
                  source={{ uri: checkpoint.versions[0].images[0].url }}
                  style={styles.checkpointCardImage}
                />
              )}
              <Text numberOfLines={2} ellipsizeMode="tail" style={styles.checkpointCardText}>
                {checkpoint.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text fow="bold" fs={16} mt={10} mb={5}>
          Select LoRAs (Max 6):
        </Text>
        <View style={styles.loraContainer}>
          {loras.map((lora) => (
            <View key={lora.name} style={styles.loraItem}>
              {lora.versions?.[0].images?.[0]?.url && (
                <Image source={{ uri: lora.versions[0].images[0].url }} style={styles.loraImage} />
              )}
              <Checkbox
                checked={selectedLoras.includes(lora.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    if (selectedLoras.length < 6) {
                      setSelectedLoras((prev) => [...prev, lora.id]);
                    } else {
                      alert('You can only select up to 6 LoRAs.');
                    }
                  } else {
                    setSelectedLoras((prev) => prev.filter((item) => item !== lora.id));
                  }
                }}
                aria-label={lora.name}>
                <Checkbox.Indicator />
                <Text style={styles.loraText}>{lora.name}</Text>
              </Checkbox>
            </View>
          ))}
        </View>
        <Text>Selected LoRAs: {selectedLoras.join(', ')}</Text>

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
          Width:
        </Text>
        <Input value={width} onChangeText={setWidth} keyboardType="numeric" size="md" />

        <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
          Height:
        </Text>
        <Input value={height} onChangeText={setHeight} keyboardType="numeric" size="md" />

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
            <Image source={{ uri: generatedImage }} style={styles.generatedImage} />
          </View>
        )}
      </ScrollView>
    </Theme>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  checkpointContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  checkpointCard: {
    width: checkpointCardWidth,
    // Removed aspectRatio: 1,
    height: 120, // Set a fixed height
    borderWidth: 1,
    borderColor: 'lightgray',
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  selectedCheckpoint: {
    borderColor: '$blue5',
    borderWidth: 2,
    opacity: 1,
  },
  checkpointCardImage: {
    width: '100%',
    height: '70%',
    resizeMode: 'cover',
  },
  checkpointCardText: {
    textAlign: 'center',
    padding: 8,
    fontSize: 12,
  },
  loraContainer: {
    marginBottom: 16,
  },
  loraItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  loraImage: {
    width: 60,
    height: 60,
    borderRadius: 4,
    marginRight: 10,
    resizeMode: 'cover',
  },
  loraText: {
    flexShrink: 1,
  },
  generatedImage: {
    width: 256,
    height: 256,
    resizeMode: 'contain',
    marginTop: 8,
  },
});

export default ImageGenerationScreen;
