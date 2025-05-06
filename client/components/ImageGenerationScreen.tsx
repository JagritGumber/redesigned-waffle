import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dimensions, Alert } from 'react-native';
import {
  Text,
  Input,
  Button,
  Image,
  View,
  ScrollView,
  YStack,
  XStack,
  Spinner,
  Checkbox,
  Label,
  SizeTokens,
  SizableText,
} from 'tamagui';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import { CivitaiModelVersionWithFilesAndImages } from '~/backend/schema/modelVersions'; // Needed for the state type
import ModelSelectList from './ModelSelectList'; // Assuming this component exists and works with CivitaiModelWithRelations[]
import { ASPECT_RATIOS } from '~/constants/generation'; // Ensure this is correct
import useModels from '~/utils/fetchModels'; // Ensure this path is correct
import axios from 'axios';
import useGenerationStore from '~/store/useGenerationStore'; // Import the store
import { useLocalSearchParams } from 'expo-router'; // To read params

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Define the expected structure from the store
interface SelectedModelAndVersion {
  model: CivitaiModelWithRelations;
  version: CivitaiModelVersionWithFilesAndImages;
}

// Helper function to get filename from runpodPath
// This filename is often what A1111 uses internally to identify models
function getFilenameFromRunpodPath(runpodPath: string | undefined | null): string | undefined {
  if (!runpodPath) return undefined;
  // Extract the last part of the path
  const parts = runpodPath.split('/');
  const filenameWithExtension = parts[parts.length - 1];
  // Remove extension (handles cases with multiple dots like foo.tar.gz)
  const lastDotIndex = filenameWithExtension.lastIndexOf('.');
  if (lastDotIndex > 0) {
    return filenameWithExtension.substring(0, lastDotIndex);
  }
  return filenameWithExtension; // Return as is if no extension found at the end
}

// Helper function to get the A1111 model name (filename)
// This helper specifically uses the first file's runpodPath, which is a common convention
// for getting the primary model file identifier.
function getA1111ModelName(item: SelectedModelAndVersion | null): string | undefined {
  if (!item || !item.version || !item.version.files || item.version.files.length === 0) {
    return undefined;
  }
  const filePath = item.version.files.at(0)?.runpodPath;
  return getFilenameFromRunpodPath(filePath);
}

const ImageGenerationScreen = () => {
  // Use zustand store - pulling out the new structure and actions
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
    selectedAestheticGradients, // SelectedModelAndVersion[]
    addOrRemoveAestheticGradient,
    selectedControlnets,
    addOrRemoveControlnet,
    selectedPose,
    setSelectedPose,
    selectedAspectRatio,
    setSelectedAspectRatio,
    useCustomRatio,
    setUseCustomRatio,
    loadFromParams, // Action to load from params
  } = useGenerationStore();

  // Fetching model lists - these still return CivitaiModelWithRelations[]
  const { data: checkpoints, isLoading: loadingCheckpoints } = useModels('checkpoints');
  const { data: loras, isLoading: loadingLoras } = useModels('loras');
  const { data: textualInversions, isLoading: loadingTIs } = useModels('textual-inversions');
  const { data: hypernetworks, isLoading: loadingHN } = useModels('hypernetworks');
  const { data: aestheticGradients, isLoading: loadingAG } = useModels('aesthetic-gradients');
  const { data: controlnets, isLoading: loadingCN } = useModels('controlnets');
  const { data: poses, isLoading: loadingPoses } = useModels('poses');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const [checkpointColumns, setCheckpointColumns] = useState<number>(4);
  const [loraColumns, setLoraColumns] = useState<number>(4);
  const [otherModelColumns, setOtherModelColumns] = useState<number>(4);

  const params = useLocalSearchParams();

  // Effect to update columns based on screen size
  useEffect(() => {
    const updateColumns = () => {
      const width = Dimensions.get('window').width;
      const baseColumns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
      setCheckpointColumns(baseColumns);
      setLoraColumns(baseColumns);
      setOtherModelColumns(baseColumns);
    };

    const subscription = Dimensions.addEventListener('change', updateColumns);
    updateColumns();

    return () => subscription.remove();
  }, []);

  // Effect to load state from navigation params once models are loaded
  useEffect(() => {
    // Check if params exist and relevant model data is loaded/loading is complete
    // We wait for all relevant model types to potentially be loaded before attempting to load params
    const areModelsLoaded =
      (checkpoints || !loadingCheckpoints) &&
      (loras || !loadingLoras) &&
      (textualInversions || !loadingTIs) &&
      (hypernetworks || !loadingHN) &&
      (aestheticGradients || !loadingAG) &&
      (controlnets || !loadingCN) &&
      (poses || !loadingPoses);

    if (Object.keys(params).length > 0 && areModelsLoaded) {
      console.log('Attempting to load state from params...');
      loadFromParams(params, {
        checkpoints,
        loras,
        textualInversions,
        hypernetworks,
        aestheticGradients,
        controlnets,
        poses,
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
  const handleCheckpointPress = useCallback(
    (checkpoint: CivitaiModelWithRelations) => {
      console.log('ImageGenerationScreen: Checkpoint pressed:', checkpoint.id); // Added log
      setSelectedCheckpoint(checkpoint);
    },
    [setSelectedCheckpoint]
  );

  // LoRA select uses the store action addOrRemoveLora
  const handleLoraSelect = useCallback(
    (lora: CivitaiModelWithRelations) => {
      console.log('ImageGenerationScreen: LoRA pressed/selected:', lora.id); // Added log
      // Check if the model is already selected
      const isCurrentlySelected = selectedLoras.some((item) => item.model.id === lora.id);

      // If not already selected and limit reached, show alert
      if (!isCurrentlySelected && selectedLoras.length >= 6) {
        Alert.alert('Limit Reached', 'You can only select up to 6 LoRAs.');
        return;
      }

      // addOrRemoveLora now takes the model object
      addOrRemoveLora(lora);
    },
    [selectedLoras, addOrRemoveLora] // Depend on store state and action
  );

  const handleTextualInversionSelect = useCallback(
    (ti: CivitaiModelWithRelations) => {
      console.log('ImageGenerationScreen: Textual Inversion pressed/selected:', ti.id); // Added log
      addOrRemoveTextualInversion(ti);
    },
    [addOrRemoveTextualInversion]
  );

  const handleHypernetworkSelect = useCallback(
    (hn: CivitaiModelWithRelations) => {
      console.log('ImageGenerationScreen: Hypernetwork pressed/selected:', hn.id); // Added log
      addOrRemoveHypernetwork(hn);
    },
    [addOrRemoveHypernetwork]
  );

  const handleAestheticGradientSelect = useCallback(
    (ag: CivitaiModelWithRelations) => {
      console.log('ImageGenerationScreen: Aesthetic Gradient pressed/selected:', ag.id); // Added log
      addOrRemoveAestheticGradient(ag);
    },
    [addOrRemoveAestheticGradient]
  );

  const handleControlnetSelect = useCallback(
    (cn: CivitaiModelWithRelations) => {
      console.log('ImageGenerationScreen: Controlnet pressed/selected:', cn.id); // Added log
      addOrRemoveControlnet(cn);
    },
    [addOrRemoveControlnet]
  );

  const handlePosePress = useCallback(
    (pose: CivitaiModelWithRelations) => {
      console.log('ImageGenerationScreen: Pose pressed:', pose.id); // Added log
      // Check if selecting the already selected pose to deselect
      // Use ?.model?.id to safely access the ID from the state object
      if (selectedPose?.model?.id === pose.id) {
        console.log('ImageGenerationScreen: Deselecting pose:', pose.id); // Added log
        setSelectedPose(null); // Deselect
      } else {
        console.log('ImageGenerationScreen: Selecting pose:', pose.id); // Added log
        setSelectedPose(pose); // Select new pose (store action handles version selection)
      }
    },
    [selectedPose, setSelectedPose]
  );
  // Pose is single select, removal is just setSelectedPose(null) done inline

  const handleAspectRatioSelect = useCallback(
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

  const handleCustomRatioSelect = useCallback(() => {
    setSelectedAspectRatio('custom');
    setUseCustomRatio(true);
  }, [setSelectedAspectRatio, setUseCustomRatio]);

  // Function to build the A1111 payload
  const buildPayload = useCallback(() => {
    // Get the A1111 model name for the checkpoint
    const checkpointModelName = getA1111ModelName(selectedCheckpoint);

    if (!checkpointModelName) {
      Alert.alert('Error', 'Checkpoint model and version not selected or version has no files.');
      return null;
    }

    // --- Build Prompt Embeddings (LoRAs, TIs, HNs, AGs) ---
    // These are typically added directly to the prompt string in A1111
    let fullPrompt = prompt || '';
    const negative = negativePrompt || '';

    const loraEmbeddings = selectedLoras
      .map((item) => {
        const modelName = getA1111ModelName(item);
        // Civitai API often has a weight prop on the version file object.
        // If your schema `CivitaiModelVersionWithFilesAndImages.files[].weight` exists, use that.
        // If not, and the store added a defaultWeight to the item object itself, use that.
        // Let's assume `item.model.defaultWeight` provides the weight, fallback to 1.0
        const weight = item.model.defaultWeight ?? 1.0; // Common place for a default weight
        return modelName ? `<lora:${modelName}:${weight}>` : '';
      })
      .filter(Boolean) // Remove empty strings
      .join(' ');

    const tiEmbeddings = selectedTextualInversions
      .map((item) => {
        const modelName = getA1111ModelName(item);
        // TIs often just use the name or a fixed weight like 1.0
        return modelName ? `<ti:${modelName}>` : ''; // Common format
      })
      .filter(Boolean)
      .join(' ');

    const hnEmbeddings = selectedHypernetworks
      .map((item) => {
        const modelName = getA1111ModelName(item);
        // HN format, often <hn:filename>
        return modelName ? `<hn:${modelName}>` : ''; // Assuming this format
      })
      .filter(Boolean)
      .join(' ');

    const agEmbeddings = selectedAestheticGradients
      .map((item) => {
        const modelName = getA1111ModelName(item);
        // AG format, might vary, sometimes just filename, sometimes like TI
        return modelName ? `<ag:${modelName}>` : ''; // Assuming this format
      })
      .filter(Boolean)
      .join(' ');

    // Combine prompt parts
    if (loraEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + loraEmbeddings; // Prepend space only if prompt exists
    if (tiEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + tiEmbeddings;
    if (hnEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + hnEmbeddings;
    if (agEmbeddings) fullPrompt += (fullPrompt ? ' ' : '') + agEmbeddings;

    // --- Build alwayson_scripts for ControlNet/Pose ---
    const alwayson_scripts: any = {};
    const controlnetArgs: any[] = [];

    // Add selected ControlNets
    selectedControlnets.forEach((cnItem) => {
      const cnModelName = getA1111ModelName(cnItem);
      if (cnModelName) {
        controlnetArgs.push({
          // **IMPORTANT:** ControlNet requires `input_image` (base64) and often `module` (preprocessor)
          // This component doesn't currently handle selecting an image or preprocessor.
          // The payload below is incomplete without these.
          // You would need UI to select/capture an image and choose a preprocessor.
          // Example structure:
          // input_image: 'base64_encoded_image_data', // Required!
          // module: 'canny', // Or 'openpose', 'none', etc. Required or use 'none'
          model: cnModelName, // The A1111 model name (filename)
          // Other optional parameters: weight, control_mode, resize_mode, etc.
          // weight: 1.0, // Example
          // control_mode: 'Balanced', // Example
        });
      }
    });

    // Add selected Pose (handled as a single ControlNet)
    if (selectedPose) {
      const poseModelName = getA1111ModelName(selectedPose);
      if (poseModelName) {
        controlnetArgs.push({
          // **IMPORTANT:** Like general ControlNet, this requires `input_image` (the pose image)
          // and often `module` (like 'openpose' or 'none').
          // This component doesn't currently handle this.
          // Example structure:
          // input_image: 'base64_encoded_pose_image_data', // Required!
          // module: 'openpose', // Or 'none' depending on the model
          model: poseModelName, // The A1111 model name (filename)
          // weight: 1.0, // Example
        });
      }
    }

    // Add ControlNet section to alwayson_scripts if there are any args
    if (controlnetArgs.length > 0) {
      // The key 'ControlNet' is specific to the A1111 extension. Verify this key if needed.
      alwayson_scripts.ControlNet = {
        args: controlnetArgs,
      };
    }

    // --- Construct Final Payload ---
    const payload: any = {
      prompt: fullPrompt,
      negative_prompt: negative,
      width: parseInt(width, 10),
      height: parseInt(height, 10),
      steps: 25, // Hardcoded for now
      cfg_scale: 7.5, // Hardcoded for now
      seed: useRandomSeed ? -1 : parseInt(seed, 10) || -1, // -1 is random seed in A1111
      batch_size: parseInt(numImages, 10) || 1,
      n_iter: 1, // Number of batches (set to 1 for simplicity, batch_size handles num images)
      override_settings: {
        // Use the A1111 model name (filename from runpodPath)
        sd_model_checkpoint: checkpointModelName,
        // Other potential overrides: sd_vae, CLIP_stop_at_last_layers, etc.
      },
    };

    // Add alwayson_scripts if not empty
    if (Object.keys(alwayson_scripts).length > 0) {
      payload.alwayson_scripts = alwayson_scripts;
    }

    // --- Validation ---
    if (!payload.prompt) {
      // Basic prompt validation
      Alert.alert('Input Error', 'Prompt cannot be empty.');
      return null;
    }
    if (
      isNaN(payload.width) ||
      isNaN(payload.height) ||
      payload.width <= 0 ||
      payload.height <= 0 ||
      payload.width > 2048 || // Add some reasonable limits
      payload.height > 2048
    ) {
      Alert.alert(
        'Input Error',
        'Please enter valid positive numbers for width and height (max 2048).'
      );
      return null;
    }
    // Warn if dimensions are unusual for SD1.5
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
      // Allow -1 for random
      Alert.alert('Input Error', 'Please enter a valid number for seed (-1 for random).');
      return null;
    }
    if (isNaN(payload.batch_size) || payload.batch_size <= 0 || payload.batch_size > 8) {
      // Limit batch size
      Alert.alert('Input Error', 'Please enter a valid positive number for images (1-8).');
      return null;
    }

    console.log('Generated A1111 Payload:', JSON.stringify(payload, null, 2)); // Pretty print payload
    return payload;
  }, [
    prompt,
    negativePrompt,
    width,
    height,
    numImages,
    seed,
    useRandomSeed,
    selectedCheckpoint, // Dependency includes the {model, version} structure
    selectedLoras, // Dependency includes the {model, version} structure
    selectedTextualInversions, // Dependency includes the {model, version} structure
    selectedHypernetworks, // Added dependency
    selectedAestheticGradients, // Added dependency
    selectedControlnets, // Added dependency
    selectedPose, // Added dependency
    // getA1111ModelName is stable, no need to add
    // getFilenameFromRunpodPath is stable, no need to add
  ]);

  const handleTestGenerate = useCallback(async () => {
    console.log('Attempting Test Generate...'); // Added log
    const payload = buildPayload();
    if (!payload) {
      console.warn('Build Payload failed for Test Generate.'); // Added log
      return;
    }

    if (!BACKEND_URL) {
      Alert.alert('Error', 'Backend URL is not configured.');
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null); // Clear previous test image

    try {
      // Assuming your backend wrapper around A1111's /sdapi/v1/txt2img
      // For a single image test, batch_size should ideally be 1 in the payload.
      payload.batch_size = 1;
      payload.n_iter = 1; // Ensure only one image is requested

      const response = await axios.post(`${BACKEND_URL}/api/v1/generator/generate`, payload);
      const data = response.data;

      // Assuming your backend returns `{ status: 'success', result: { image_url: '...' } }` or base64
      if (data.status === 'success' && data.result) {
        if (data.result.image_url) {
          setGeneratedImage(data.result.image_url);
          console.log('Test image generated (URL):', data.result.image_url);
        } else if (data.result.images && data.result.images.length > 0) {
          // Handle base64 response if backend mimics A1111 /txt2img response structure
          setGeneratedImage(`data:image/png;base64,${data.result.images[0]}`);
          console.log(
            'Test image generated (base64):',
            data.result.images[0].substring(0, 50) + '...'
          );
        } else {
          console.error('Test generation response success but no image data:', data); // Added log
          Alert.alert('Generation Failed', 'Response successful but no image data received.');
        }
      } else {
        console.error('Test generation response error:', data); // Added log
        Alert.alert(
          'Generation Failed',
          data.message || 'Unknown error during test generation. Check backend logs.'
        );
      }
    } catch (error: any) {
      console.error('Error generating test image:', error); // Added log
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
    console.log('Attempting Batch Generate...'); // Added log
    const payload = buildPayload();
    if (!payload) {
      console.warn('Build Payload failed for Batch Generate.'); // Added log
      return;
    }

    // Ensure batch_size is set for batch generation and > 1
    const batchSize = parseInt(numImages, 10);
    if (isNaN(batchSize) || batchSize <= 1 || batchSize > 8) {
      Alert.alert('Input Error', 'Batch generation requires Number of Images between 2 and 8.');
      return;
    }

    // Update payload for batch
    payload.batch_size = batchSize;
    payload.n_iter = 1; // Generate batchSize images in a single request

    if (!BACKEND_URL) {
      Alert.alert('Error', 'Backend URL is not configured.');
      return;
    }

    setIsGenerating(true);
    // Note: Batch generation usually doesn't return images immediately,
    // it kicks off a job. Clear test image display.
    setGeneratedImage(null);

    try {
      // Assuming /generate-batch endpoint handles the A1111 payload and queues it
      const response = await axios.post(`${BACKEND_URL}/api/v1/generator/generate-batch`, payload);
      const data = response.data;

      // Assuming your backend returns `{ status: 'success', jobId: '...' }` for batch
      if (data.status === 'success' && data.jobId) {
        console.log('Batch generation started:', data); // Added log
        Alert.alert('Batch Started', `Batch generation started. Job ID: ${data.jobId}`);
        // Optionally navigate to a jobs or gallery screen to see results later
      } else {
        console.error('Batch generation response error:', data); // Added log
        Alert.alert(
          'Batch Failed',
          data.message || 'Unknown error during batch generation. Check backend logs.'
        );
      }
    } catch (error: any) {
      console.error('Error starting batch generation:', error); // Added log
      Alert.alert(
        'Error',
        'Failed to start batch generation: ' +
          (error.response?.data?.message || error.message || 'Unknown error')
      );
    } finally {
      setIsGenerating(false);
    }
  }, [buildPayload, BACKEND_URL, numImages]); // Added numImages dependency

  // --- Helper functions for ModelSelectList to show selected state ---
  // These now check the .model.id property of the selected items in the state array/object
  // Added logs here to see if these are called and what they return
  const isCheckpointSelected = useCallback(
    (modelId: string | number) => {
      const isSelected = selectedCheckpoint?.model?.id.toString() === String(modelId);
      // console.log(`Checking Checkpoint ID ${modelId}: ${isSelected}`); // Added log
      return isSelected;
    },
    [selectedCheckpoint]
  );

  const isLoraSelected = useCallback(
    (modelId: string | number) => {
      const isSelected = selectedLoras.some((item) => item.model.id.toString() === String(modelId));
      // console.log(`Checking LoRA ID ${modelId}: ${isSelected}`); // Added log
      return isSelected;
    },
    [selectedLoras]
  );

  const isTISelected = useCallback(
    (modelId: string | number) => {
      const isSelected = selectedTextualInversions.some(
        (item) => item.model.id.toString() === String(modelId)
      );
      // console.log(`Checking TI ID ${modelId}: ${isSelected}`); // Added log
      return isSelected;
    },
    [selectedTextualInversions]
  );

  const isHNSelected = useCallback(
    (modelId: string | number) => {
      const isSelected = selectedHypernetworks.some(
        (item) => item.model.id.toString() === String(modelId)
      );
      // console.log(`Checking HN ID ${modelId}: ${isSelected}`); // Added log
      return isSelected;
    },
    [selectedHypernetworks]
  );

  const isAGSelected = useCallback(
    (modelId: string | number) => {
      const isSelected = selectedAestheticGradients.some(
        (item) => item.model.id.toString() === String(modelId)
      );
      // console.log(`Checking AG ID ${modelId}: ${isSelected}`); // Added log
      return isSelected;
    },
    [selectedAestheticGradients]
  );

  const isCNSelected = useCallback(
    (modelId: string | number) => {
      const isSelected = selectedControlnets.some(
        (item) => item.model.id.toString() === String(modelId)
      );
      // console.log(`Checking CN ID ${modelId}: ${isSelected}`); // Added log
      return isSelected;
    },
    [selectedControlnets]
  );

  const isPoseSelected = useCallback(
    (modelId: string | number) => {
      const isSelected = selectedPose?.model?.id.toString() === String(modelId);
      // console.log(`Checking Pose ID ${modelId}: ${isSelected}`); // Added log
      return isSelected;
    },
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

  // Collect state variables for FlashList extraData
  const extraDataForFlashList = useMemo(
    () => ({
      selectedCheckpointId: selectedCheckpoint?.model?.id,
      selectedLorasIds: selectedLoras.map((item) => item.model.id),
      selectedTextualInversionsIds: selectedTextualInversions.map((item) => item.model.id),
      selectedHypernetworksIds: selectedHypernetworks.map((item) => item.model.id),
      selectedAestheticGradientsIds: selectedAestheticGradients.map((item) => item.model.id),
      selectedControlnetsIds: selectedControlnets.map((item) => item.model.id),
      selectedPoseId: selectedPose?.model?.id,
      // Add any other state that affects how individual list items render but isn't in the item data itself
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

  // Helper to get the selected model name and version name for display
  const getSelectedModelInfo = (item: SelectedModelAndVersion | null) => {
    if (!item) return 'None selected';
    return `${item.model.name} (${item.version.name})`;
  };

  return (
    <ScrollView flex={1} padding={16} bg={'$background'}>
      {/* Checkpoint Selection */}
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        {/* Added marginTop to first section */}
        Select Checkpoint (Required):
      </Text>
      {/* Show ModelSelectList only if checkpoints are loaded */}
      {checkpoints && checkpoints.length > 0 ? (
        <YStack mb="$2">
          <ModelSelectList
            numColumns={checkpointColumns}
            models={checkpoints}
            onModelPress={handleCheckpointPress}
            isSelected={isCheckpointSelected}
            extraData={extraDataForFlashList} // Pass extraData
          />
        </YStack>
      ) : (
        !loadingCheckpoints && (
          <SizableText size="$3" color="$gray10">
            No checkpoint models found.
          </SizableText>
        )
      )}
      {/* LoRA Selection */}
      {loras && loras.length > 0 ? (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select LoRAs (Max 6):
          </Text>
          <YStack mb="$2">
            <ModelSelectList
              numColumns={loraColumns}
              models={loras}
              onModelPress={handleLoraSelect}
              isSelected={isLoraSelected}
              extraData={extraDataForFlashList} // Pass extraData
            />
          </YStack>
        </>
      ) : (
        !loadingLoras && (
          <SizableText size="$3" color="$gray10" marginTop={10}>
            No LoRA models found.
          </SizableText>
        )
      )}
      {/* Textual Inversion Selection */}
      {textualInversions && textualInversions.length > 0 ? (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Textual Inversions:
          </Text>
          <YStack mb="$2">
            <ModelSelectList
              numColumns={otherModelColumns}
              models={textualInversions}
              onModelPress={handleTextualInversionSelect}
              isSelected={isTISelected}
              extraData={extraDataForFlashList} // Pass extraData
            />
          </YStack>
        </>
      ) : (
        !loadingTIs && (
          <SizableText size="$3" color="$gray10" marginTop={10}>
            No Textual Inversion models found.
          </SizableText>
        )
      )}
      {/* Hypernetwork Selection */}
      {hypernetworks && hypernetworks.length > 0 ? (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Hypernetworks:
          </Text>
          <YStack mb="$2">
            <ModelSelectList
              numColumns={otherModelColumns}
              models={hypernetworks}
              onModelPress={handleHypernetworkSelect}
              isSelected={isHNSelected}
              extraData={extraDataForFlashList} // Pass extraData
            />
          </YStack>
        </>
      ) : (
        !loadingHN && (
          <SizableText size="$3" color="$gray10" marginTop={10}>
            No Hypernetwork models found.
          </SizableText>
        )
      )}
      {/* Aesthetic Gradient Selection */}
      {aestheticGradients && aestheticGradients.length > 0 ? (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Aesthetic Gradients:
          </Text>
          <YStack mb="$2">
            <ModelSelectList
              numColumns={otherModelColumns}
              models={aestheticGradients}
              onModelPress={handleAestheticGradientSelect}
              isSelected={isAGSelected}
              extraData={extraDataForFlashList} // Pass extraData
            />
          </YStack>
        </>
      ) : (
        !loadingAG && (
          <SizableText size="$3" color="$gray10" marginTop={10}>
            No Aesthetic Gradient models found.
          </SizableText>
        )
      )}
      {/* Controlnet Selection */}
      {controlnets && controlnets.length > 0 ? (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Controlnets:
          </Text>
          <YStack mb="$2">
            <ModelSelectList
              numColumns={otherModelColumns}
              models={controlnets}
              onModelPress={handleControlnetSelect}
              isSelected={isCNSelected}
              extraData={extraDataForFlashList} // Pass extraData
            />
          </YStack>
        </>
      ) : (
        !loadingCN && (
          <SizableText size="$3" color="$gray10" marginTop={10}>
            No Controlnet models found.
          </SizableText>
        )
      )}
      {/* Pose Selection */}
      {poses && poses.length > 0 ? (
        <>
          <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
            Select Pose (uses ControlNet):
          </Text>
          {/* Display currently selected pose with a clear option */}
          {selectedPose && (
            <YStack space="$1" mb="$2">
              <SizableText size="$3">Currently Selected Pose Model:</SizableText>
              <Button
                key={selectedPose.model.id}
                size="$3"
                chromeless
                borderWidth={1}
                borderColor="$accent10"
                backgroundColor="$accent0"
                color="$accent12"
                onPress={() => {
                  console.log(
                    'ImageGenerationScreen: Deselecting pose via button:',
                    selectedPose.model.id
                  );
                  setSelectedPose(null);
                }} // Tap to deselect
              >
                <XStack gap="$1" alignItems="center">
                  <Text fontWeight="bold">{selectedPose.model.name}</Text>
                  <Text fontSize="$2">({selectedPose.version.name})</Text>
                  {/* TODO: Add a dropdown/selector here to change the version using updatePoseVersion */}
                  <Text fontSize="$3" color="$red9">
                    X
                  </Text>
                  {/* Simple remove indicator */}
                </XStack>
              </Button>
            </YStack>
          )}
          {/* Show selection list if no pose is selected OR if there are other poses to choose */}
          {(!selectedPose || (poses && poses.length > 1)) && (
            <YStack mb="$2">
              <ModelSelectList
                numColumns={otherModelColumns}
                models={poses}
                onModelPress={handlePosePress}
                isSelected={isPoseSelected}
                extraData={extraDataForFlashList} // Pass extraData
              />
            </YStack>
          )}
          {/* Note about ControlNet input image */}
          {(selectedPose || (selectedControlnets && selectedControlnets.length > 0)) && ( // Check selectedControlnets too
            <SizableText size="$2" color="$yellow10" mb="$3">
              Note: ControlNet/Pose requires an input image (e.g., a pose image) and preprocessor
              selection in the payload, which is not currently implemented in this UI. Generation
              may fail or behave unexpectedly without it.
            </SizableText>
          )}
        </>
      ) : (
        !loadingPoses && (
          <SizableText size="$3" color="$gray10" marginTop={10}>
            No Pose models found.
          </SizableText>
        )
      )}
      {/* Aspect Ratio / Dimensions */}
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Aspect Ratio:
      </Text>
      <XStack flexWrap="wrap" gap={8} marginTop={8}>
        {[...ASPECT_RATIOS, 'Custom'].map((ratio) => (
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
      {/* Prompt */}
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Prompt:
      </Text>
      <Input
        multiline
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Enter your prompt"
        size="md"
        numberOfLines={3} // Give it some initial height
        minHeight={60} // Ensure it grows
      />
      {/* Negative Prompt */}
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Negative Prompt (Optional):
      </Text>
      <Input
        multiline
        value={negativePrompt}
        onChangeText={setNegativePrompt}
        placeholder="Enter negative prompt (optional)"
        size="md"
        numberOfLines={3} // Give it some initial height
        minHeight={60} // Ensure it grows
      />
      {/* Number of Images */}
      <Text fontWeight="bold" fontSize={16} marginTop={10} marginBottom={5}>
        Number of Images (for Batch):
      </Text>
      <Input value={numImages} onChangeText={setNumImages} keyboardType="numeric" size="md" />
      {/* Seed Control */}
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
      {/* Generation Buttons */}
      <Button
        marginTop={20}
        onPress={handleTestGenerate}
        // Disable if no checkpoint selected or if generating
        disabled={isGenerating || !selectedCheckpoint?.model}>
        {/* Check model exists */}
        {isGenerating ? (
          <Spinner size="small" color="$color" />
        ) : (
          <Text>Test Generate (1 Image)</Text>
        )}
      </Button>
      <Button
        marginTop={10}
        onPress={handleBatchGenerate}
        // Disable if no checkpoint selected, generating, or num images <= 1
        disabled={isGenerating || !selectedCheckpoint?.model || parseInt(numImages, 10) <= 1}>
        {/* Check model exists */}
        {isGenerating ? (
          <Spinner size="small" color="$color" />
        ) : (
          <Text>Batch Generate ({numImages || 1} Images)</Text>
        )}
      </Button>
      {/* Test Generate Image Display */}
      {generatedImage && (
        <YStack marginTop={20} alignItems="center">
          <Text fontWeight="bold" fontSize={16} marginBottom={8}>
            Generated Image (Test):
          </Text>
          {/* Scale image based on its aspect ratio and screen width */}
          <Image
            source={{ uri: generatedImage }}
            // A fixed max width or screen width minus padding
            maxWidth="100%"
            maxHeight={400} // Limit height to prevent excessive scrolling
            flexBasis={300} // Or some initial size hint
            flexGrow={1}
            flexShrink={1}
            resizeMode="contain"
            // You might need to dynamically calculate aspect ratio for height if not fixed
            // Assuming typical square-ish or common ratios for display
            style={{ aspectRatio: (parseInt(width, 10) || 1) / (parseInt(height, 10) || 1) }}
          />
        </YStack>
      )}
      <View height={50} /> {/* Add some padding at the bottom */}
    </ScrollView>
  );
};

export default ImageGenerationScreen;
