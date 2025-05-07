// app/image-generation/index.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dimensions, Alert } from 'react-native';
import { ScrollView, YStack, Spinner, SizableText, View } from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import { CivitaiModelVersionWithFilesAndImages } from '~/backend/schema/modelVersions';
import { ASPECT_RATIOS } from '~/constants/generation';
import useModels from '~/utils/fetchModels';
import axios from 'axios';
import useGenerationStore from '~/store/useGenerationStore';
import { useLocalSearchParams } from 'expo-router';

// Import the new child components
import CheckpointSelection from '~/components/image-generation/CheckpointSelection';
import LoraSelection from '~/components/image-generation/LoraSelection';
import OtherModelsSelection from '~/components/image-generation/OtherModelsSelection';
import PoseSelection from '~/components/image-generation/PoseSelection';
import DimensionsInput from '~/components/image-generation/DimensionsInput';
import PromptInput from '~/components/image-generation/PromptInput';
import SeedInput from '~/components/image-generation/SeedInput';
import GenerationButtons from '~/components/image-generation/GenerationButtons';
import GeneratedImageView from '~/components/image-generation/GeneratedImageView';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Define the expected structure from the store
interface SelectedModelAndVersion {
  model: CivitaiModelWithRelations;
  version: CivitaiModelVersionWithFilesAndImages;
}

// Helper function to get filename from runpodPath
function getFilenameFromRunpodPath(runpodPath: string | undefined | null): string | undefined {
  if (!runpodPath) return undefined;
  const parts = runpodPath.split('/');
  const filenameWithExtension = parts[parts.length - 1];
  const lastDotIndex = filenameWithExtension.lastIndexOf('.');
  if (lastDotIndex > 0) {
    return filenameWithExtension.substring(0, lastDotIndex);
  }
  return filenameWithExtension;
}

// Helper function to get the A1111 model name (filename)
function getA1111ModelName(item: SelectedModelAndVersion | null): string | undefined {
  if (!item || !item.version || !item.version.files || item.version.files.length === 0) {
    return undefined;
  }
  const filePath = item.version.files.at(0)?.runpodPath;
  return getFilenameFromRunpodPath(filePath);
}

const ImageGenerationScreen = () => {
  // Get all state and actions from the store here at the top level
  const {
    prompt,
    setPrompt,
    negativePrompt,
    setNegativePrompt,
    width,
    setWidth,
    height,
    setHeight,
    numImages,
    setNumImages,
    seed,
    setSeed,
    useRandomSeed,
    setUseRandomSeed,
    selectedCheckpoint,
    setSelectedCheckpoint,
    selectedLoras,
    addOrRemoveLora,
    selectedTextualInversions,
    addOrRemoveTextualInversion,
    selectedHypernetworks,
    addOrRemoveHypernetwork,
    selectedAestheticGradients,
    addOrRemoveAestheticGradient,
    selectedControlnets,
    addOrRemoveControlnet,
    selectedPose,
    setSelectedPose,
    selectedAspectRatio,
    setSelectedAspectRatio,
    useCustomRatio,
    setUseCustomRatio,
    loadFromParams,
  } = useGenerationStore();

  // Fetching model lists
  const { data: checkpoints, isLoading: loadingCheckpoints } = useModels('checkpoints');
  const { data: loras, isLoading: loadingLoras } = useModels('loras');
  const { data: textualInversions, isLoading: loadingTIs } = useModels('textual-inversions');
  const { data: hypernetworks, isLoading: loadingHN } = useModels('hypernetworks');
  const { data: aestheticGradients, isLoading: loadingAG } = useModels('aesthetic-gradients');
  const { data: controlnets, isLoading: loadingCN } = useModels('controlnets');
  const { data: poses, isLoading: loadingPoses } = useModels('poses');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const [columns, setColumns] = useState<number>(4); // Use a single state for columns

  const params = useLocalSearchParams();

  // Effect to update columns based on screen size
  useEffect(() => {
    const updateColumns = () => {
      const windowWidth = Dimensions.get('window').width;
      const baseColumns = windowWidth >= 900 ? 4 : windowWidth >= 600 ? 3 : 2;
      setColumns(baseColumns);
    };

    const subscription = Dimensions.addEventListener('change', updateColumns);
    updateColumns(); // Initial call

    return () => subscription.remove();
  }, []);

  // Effect to load state from navigation params once models are loaded
  useEffect(() => {
    const areModelsLoaded =
      !loadingCheckpoints &&
      checkpoints !== undefined && // Check explicitly for not loading AND data presence
      !loadingLoras &&
      loras !== undefined &&
      !loadingTIs &&
      textualInversions !== undefined &&
      !loadingHN &&
      hypernetworks !== undefined &&
      !loadingAG &&
      aestheticGradients !== undefined &&
      !loadingCN &&
      controlnets !== undefined &&
      !loadingPoses &&
      poses !== undefined;

    if (Object.keys(params).length > 0 && areModelsLoaded) {
      console.log('Attempting to load state from params...');
      loadFromParams(params, {
        checkpoints: checkpoints || [], // Pass empty array if undefined
        loras: loras || [],
        textualInversions: textualInversions || [],
        hypernetworks: hypernetworks || [],
        aestheticGradients: aestheticGradients || [],
        controlnets: controlnets || [],
        poses: poses || [],
      });
    }
  }, [
    params,
    loadFromParams,
    checkpoints,
    loadingCheckpoints,
    loras,
    loadingLoras,
    textualInversions,
    loadingTIs,
    hypernetworks,
    loadingHN,
    aestheticGradients,
    loadingAG,
    controlnets,
    loadingCN,
    poses,
    loadingPoses,
  ]);

  // Handlers using store actions - pass the full model object
  // These are defined here and passed down to child components
  const handleCheckpointPress = useCallback(
    (checkpoint: CivitaiModelWithRelations) => {
      setSelectedCheckpoint(checkpoint);
    },
    [setSelectedCheckpoint]
  );

  const handleLoraSelect = useCallback(
    (lora: CivitaiModelWithRelations) => {
      const isCurrentlySelected = selectedLoras.some((item) => item.model.id === lora.id);

      if (!isCurrentlySelected && selectedLoras.length >= 6) {
        Alert.alert('Limit Reached', 'You can only select up to 6 LoRAs.');
        return;
      }

      addOrRemoveLora(lora);
    },
    [selectedLoras, addOrRemoveLora]
  );

  const handleTextualInversionSelect = useCallback(
    (ti: CivitaiModelWithRelations) => {
      addOrRemoveTextualInversion(ti);
    },
    [addOrRemoveTextualInversion]
  );

  const handleHypernetworkSelect = useCallback(
    (hn: CivitaiModelWithRelations) => {
      addOrRemoveHypernetwork(hn);
    },
    [addOrRemoveHypernetwork]
  );

  const handleAestheticGradientSelect = useCallback(
    (ag: CivitaiModelWithRelations) => {
      addOrRemoveAestheticGradient(ag);
    },
    [addOrRemoveAestheticGradient]
  );

  const handleControlnetSelect = useCallback(
    (cn: CivitaiModelWithRelations) => {
      addOrRemoveControlnet(cn);
    },
    [addOrRemoveControlnet]
  );

  const handlePosePress = useCallback(
    (pose: CivitaiModelWithRelations) => {
      if (selectedPose?.model?.id === pose.id) {
        setSelectedPose(null); // Deselect
      } else {
        setSelectedPose(pose); // Select new pose (store action handles version selection)
      }
    },
    [selectedPose, setSelectedPose]
  );

  const handlePoseDeselect = useCallback(() => {
    setSelectedPose(null);
  }, [setSelectedPose]);

  // Helper functions for ModelSelectList to show selected state
  const isCheckpointSelected = useCallback(
    (modelId: string | number) => selectedCheckpoint?.model?.id.toString() === String(modelId),
    [selectedCheckpoint]
  );

  const isLoraSelected = useCallback(
    (modelId: string | number) =>
      selectedLoras.some((item) => item.model.id.toString() === String(modelId)),
    [selectedLoras]
  );

  const isTISelected = useCallback(
    (modelId: string | number) =>
      selectedTextualInversions.some((item) => item.model.id.toString() === String(modelId)),
    [selectedTextualInversions]
  );

  const isHNSelected = useCallback(
    (modelId: string | number) =>
      selectedHypernetworks.some((item) => item.model.id.toString() === String(modelId)),
    [selectedHypernetworks]
  );

  const isAGSelected = useCallback(
    (modelId: string | number) =>
      selectedAestheticGradients.some((item) => item.model.id.toString() === String(modelId)),
    [selectedAestheticGradients]
  );

  const isCNSelected = useCallback(
    (modelId: string | number) =>
      selectedControlnets.some((item) => item.model.id.toString() === String(modelId)),
    [selectedControlnets]
  );

  const isPoseSelected = useCallback(
    (modelId: string | number) => selectedPose?.model?.id.toString() === String(modelId),
    [selectedPose]
  );
  // --- End Helper functions ---

  const isLoadingModels =
    loadingCheckpoints ||
    loadingLoras ||
    loadingTIs ||
    loadingHN ||
    loadingAG ||
    loadingCN ||
    loadingPoses;

  // Compute extraData for FlashList memoization
  const extraDataForFlashList = useMemo(
    () => ({
      selectedCheckpointId: selectedCheckpoint?.model?.id,
      selectedLorasIds: selectedLoras.map((item) => item.model.id),
      selectedTextualInversionsIds: selectedTextualInversions.map((item) => item.model.id),
      selectedHypernetworksIds: selectedHypernetworks.map((item) => item.model.id),
      selectedAestheticGradientsIds: selectedAestheticGradients.map((item) => item.model.id),
      selectedControlnetsIds: selectedControlnets.map((item) => item.model.id),
      selectedPoseId: selectedPose?.model?.id,
    }),
    [
      selectedCheckpoint,
      selectedLoras,
      selectedTextualInversions,
      selectedHypernetworks,
      selectedAestheticGradients,
      selectedControlnets,
      selectedPose,
    ]
  );

  // Function to build the A1111 payload (kept in parent as it needs all state)
  const buildPayload = useCallback(() => {
    const checkpointModelName = getA1111ModelName(selectedCheckpoint);

    if (!checkpointModelName) {
      Alert.alert('Error', 'Checkpoint model and version not selected or version has no files.');
      return null;
    }

    let fullPrompt = prompt || '';
    const negative = negativePrompt || '';

    const loraEmbeddings = selectedLoras
      .map((item) => {
        const modelName = getA1111ModelName(item);
        const weight = item.model.defaultWeight ?? 1.0;
        return modelName ? `<lora:${modelName}:${weight}>` : '';
      })
      .filter(Boolean)
      .join(' ');

    const tiEmbeddings = selectedTextualInversions
      .map((item) => {
        const modelName = getA1111ModelName(item);
        return modelName ? `<ti:${modelName}>` : '';
      })
      .filter(Boolean)
      .join(' ');

    const hnEmbeddings = selectedHypernetworks
      .map((item) => {
        const modelName = getA1111ModelName(item);
        return modelName ? `<hn:${modelName}>` : '';
      })
      .filter(Boolean)
      .join(' ');

    const agEmbeddings = selectedAestheticGradients
      .map((item) => {
        const modelName = getA1111ModelName(item);
        return modelName ? `<ag:${modelName}>` : '';
      })
      .filter(Boolean)
      .join(' ');

    if (loraEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + loraEmbeddings;
    if (tiEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + tiEmbeddings;
    if (hnEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + hnEmbeddings;
    if (agEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + agEmbeddings;

    const alwayson_scripts: any = {};
    const controlnetArgs: any[] = [];

    selectedControlnets.forEach((cnItem) => {
      const cnModelName = getA1111ModelName(cnItem);
      if (cnModelName) {
        controlnetArgs.push({
          // Needs input_image (base64) and module (preprocessor)
          // These are placeholders as UI isn't built for them:
          input_image: '', // REQUIRED - base64 encoded image
          module: 'none', // Or a preprocessor like 'canny', 'openpose', etc.
          model: cnModelName,
        });
      }
    });

    if (selectedPose) {
      const poseModelName = getA1111ModelName(selectedPose);
      if (poseModelName) {
        controlnetArgs.push({
          // Needs input_image (base64 pose image) and module
          // These are placeholders as UI isn't built for them:
          input_image: '', // REQUIRED - base64 encoded pose image
          module: 'openpose', // Often 'openpose' or 'none' for pose models
          model: poseModelName,
        });
      }
    }

    if (controlnetArgs.length > 0) {
      alwayson_scripts.ControlNet = {
        args: controlnetArgs,
      };
    }

    const payload: any = {
      prompt: fullPrompt,
      negative_prompt: negative,
      width: parseInt(width, 10),
      height: parseInt(height, 10),
      steps: 25,
      cfg_scale: 7.5,
      seed: useRandomSeed ? -1 : parseInt(seed, 10) || -1,
      batch_size: parseInt(numImages, 10) || 1,
      n_iter: 1,
      override_settings: {
        sd_model_checkpoint: checkpointModelName,
      },
    };

    if (Object.keys(alwayson_scripts).length > 0) {
      payload.alwayson_scripts = alwayson_scripts;
    }

    if (!payload.prompt) {
      Alert.alert('Input Error', 'Prompt cannot be empty.');
      return null;
    }
    if (
      isNaN(payload.width) ||
      isNaN(payload.height) ||
      payload.width <= 0 ||
      payload.height <= 0 ||
      payload.width > 2048 ||
      payload.height > 2048
    ) {
      Alert.alert(
        'Input Error',
        'Please enter valid positive numbers for width and height (max 2048).'
      );
      return null;
    }
    if (
      checkpointModelName &&
      !checkpointModelName.toLowerCase().includes('xl') &&
      (payload.width > 768 || payload.height > 768)
    ) {
      Alert.alert(
        'Warning',
        'Dimensions > 768x768 might produce lower quality with SD1.5 models. Consider using an SDXL model.'
      );
    }

    if (!useRandomSeed && (isNaN(payload.seed) || payload.seed < -1)) {
      Alert.alert('Input Error', 'Please enter a valid number for seed (-1 for random).');
      return null;
    }
    if (isNaN(payload.batch_size) || payload.batch_size <= 0 || payload.batch_size > 8) {
      Alert.alert('Input Error', 'Please enter a valid positive number for images (1-8).');
      return null;
    }

    console.log('Generated A1111 Payload:', JSON.stringify(payload, null, 2));
    return payload;
  }, [
    prompt,
    negativePrompt,
    width,
    height,
    numImages,
    seed,
    useRandomSeed,
    selectedCheckpoint,
    selectedLoras,
    selectedTextualInversions,
    selectedHypernetworks,
    selectedAestheticGradients,
    selectedControlnets,
    selectedPose, // Ensure pose is a dependency if it affects the payload
  ]);

  const handleTestGenerate = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) return;

    if (!BACKEND_URL) {
      Alert.alert('Error', 'Backend URL is not configured.');
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      payload.batch_size = 1;
      payload.n_iter = 1;

      const response = await axios.post(`${BACKEND_URL}/api/v1/generator/generate`, payload);
      const data = response.data;

      if (data.status === 'success' && data.result) {
        if (data.result.image_url) {
          setGeneratedImage(data.result.image_url);
        } else if (data.result.images && data.result.images.length > 0) {
          setGeneratedImage(`data:image/png;base64,${data.result.images[0]}`);
        } else {
          Alert.alert('Generation Failed', 'Response successful but no image data received.');
        }
      } else {
        Alert.alert('Generation Failed', data.message || 'Unknown error during test generation.');
      }
    } catch (error: any) {
      console.error('Error generating test image:', error);
      Alert.alert(
        'Error',
        'Failed to generate test image: ' +
          (error.response?.data?.message || error.message || 'Unknown error')
      );
    } finally {
      setIsGenerating(false);
    }
  }, [buildPayload, BACKEND_URL]);

  const handleBatchGenerate = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) return;

    const batchSize = parseInt(numImages, 10);
    if (isNaN(batchSize) || batchSize <= 1 || batchSize > 8) {
      Alert.alert('Input Error', 'Batch generation requires Number of Images between 2 and 8.');
      return;
    }

    payload.batch_size = batchSize;
    payload.n_iter = 1;

    if (!BACKEND_URL) {
      Alert.alert('Error', 'Backend URL is not configured.');
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/v1/generator/generate-batch`, payload);
      const data = response.data;

      if (data.status === 'success' && data.jobId) {
        Alert.alert('Batch Started', `Batch generation started. Job ID: ${data.jobId}`);
      } else {
        Alert.alert(
          'Batch Failed',
          data.message || 'Unknown error during batch generation. Check backend logs.'
        );
      }
    } catch (error: any) {
      console.error('Error starting batch generation:', error);
      Alert.alert(
        'Error',
        'Failed to start batch generation: ' +
          (error.response?.data?.message || error.message || 'Unknown error')
      );
    } finally {
      setIsGenerating(false);
    }
  }, [buildPayload, BACKEND_URL, numImages]);

  // Derived state for disabling buttons
  const canGenerate = !!selectedCheckpoint?.model && !!prompt;

  if (isLoadingModels) {
    return (
      <View flex={1} justifyContent="center" alignItems="center" bg="$background">
        <Spinner size="large" color="$green10" />
        <SizableText mt="$3" size="$4">
          Loading models...
        </SizableText>
      </View>
    );
  }

  return (
    <ScrollView flex={1} padding={16} bg={'$background'}>
      <CheckpointSelection
        checkpoints={checkpoints}
        loadingCheckpoints={loadingCheckpoints}
        onModelPress={handleCheckpointPress}
        isSelected={isCheckpointSelected}
        columns={columns}
        extraData={extraDataForFlashList}
      />

      <LoraSelection
        loras={loras}
        loadingLoras={loadingLoras}
        onModelPress={handleLoraSelect}
        isSelected={isLoraSelected}
        columns={columns}
        extraData={extraDataForFlashList}
      />

      <OtherModelsSelection
        title="Textual Inversions"
        models={textualInversions}
        loading={loadingTIs}
        onModelPress={handleTextualInversionSelect}
        isSelected={isTISelected}
        columns={columns}
        extraData={extraDataForFlashList}
      />

      <OtherModelsSelection
        title="Hypernetworks"
        models={hypernetworks}
        loading={loadingHN}
        onModelPress={handleHypernetworkSelect}
        isSelected={isHNSelected}
        columns={columns}
        extraData={extraDataForFlashList}
      />

      <OtherModelsSelection
        title="Aesthetic Gradients"
        models={aestheticGradients}
        loading={loadingAG}
        onModelPress={handleAestheticGradientSelect}
        isSelected={isAGSelected}
        columns={columns}
        extraData={extraDataForFlashList}
      />

      <OtherModelsSelection
        title="Controlnets"
        models={controlnets}
        loading={loadingCN}
        onModelPress={handleControlnetSelect}
        isSelected={isCNSelected}
        columns={columns}
        extraData={extraDataForFlashList}
      />

      <PoseSelection
        poses={poses}
        loadingPoses={loadingPoses}
        onModelPress={handlePosePress}
        isSelected={isPoseSelected}
        selectedPose={selectedPose}
        onDeselect={handlePoseDeselect}
        columns={columns}
        extraData={extraDataForFlashList}
        hasControlnetsSelected={selectedControlnets.length > 0}
      />

      <DimensionsInput aspectRatios={ASPECT_RATIOS} />

      <PromptInput />

      <SeedInput />

      <GenerationButtons
        onTestGenerate={handleTestGenerate}
        onBatchGenerate={handleBatchGenerate}
        isGenerating={isGenerating}
        canGenerate={canGenerate}
        numImages={numImages}
      />

      <GeneratedImageView imageUrl={generatedImage} width={width} height={height} />

      <View height={50} />
    </ScrollView>
  );
};

export default ImageGenerationScreen;
