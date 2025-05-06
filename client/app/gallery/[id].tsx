import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import {
  Spinner,
  Text,
  View,
  H2,
  YStack,
  XStack,
  Separator,
  ScrollView,
  Theme,
  Button,
  useTheme,
  SizableText,
  getVariableValue,
} from 'tamagui';
import { StyleSheet, Dimensions, Platform, Image as RNImage, Alert } from 'react-native'; // Import Alert
import { SelectGeneratorJob } from '~/backend/schema';
import { InfoParsedResult } from '~/backend/types/generator';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ImageViewer from 'react-native-image-zoom-viewer';
import { IImageInfo } from 'react-native-image-zoom-viewer/built/image-viewer.type';
import { ChevronUp, X, Download } from '@tamagui/lucide-icons'; // Import Download icon

// Import file system and media library modules
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const INITIAL_LOAD_LIMIT_BEFORE = 20;
const INITIAL_LOAD_LIMIT_AFTER = 20;
const DYNAMIC_LOAD_LIMIT = 20;

// ... (hexToRgba and getJobDetailsWithNeighbors functions remain the same)
function hexToRgba(hex: string, alpha: number): string {
  const bigint = parseInt(hex.replace('#', ''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function getJobDetailsWithNeighbors(
  id: string,
  limits?: { limitBefore?: number; limitAfter?: number }
): Promise<{ items: SelectGeneratorJob[]; initialIndex: number } | null> {
  if (!BACKEND_URL) {
    console.error('BACKEND_URL is not set');
    return null;
  }
  try {
    const limitBefore = limits?.limitBefore ?? INITIAL_LOAD_LIMIT_BEFORE;
    const limitAfter = limits?.limitAfter ?? INITIAL_LOAD_LIMIT_AFTER;
    const statusFilter = 'COMPLETED';

    const url = `${BACKEND_URL}/api/v1/images/gallery/${encodeURIComponent(
      id
    )}?limitBefore=${limitBefore}&limitAfter=${limitAfter}&status=${statusFilter}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error('API fetch error:', response.status, response.statusText);
      throw new Error(`Failed to fetch job details: ${response.status} ${response.statusText}`);
    }

    const data: {
      status: string;
      message: string;
      items: SelectGeneratorJob[];
      initialIndex: number;
    } = await response.json();

    if (data.status === 'error') {
      throw new Error(`Backend error: ${data.message}`);
    }

    const viewableItems = data.items.filter(
      (item) => item.imageKey != null && item.imageKey !== ''
    );

    const initialJob = data.items[data.initialIndex];
    const initialViewableIndex = viewableItems.findIndex((item) => item.id === initialJob?.id);

    if (
      !Array.isArray(data.items) ||
      data.initialIndex === undefined ||
      data.initialIndex === null ||
      data.initialIndex < -1 ||
      (data.items.length > 0 && data.initialIndex >= data.items.length) ||
      initialViewableIndex === -1
    ) {
      console.error(
        'Invalid data format or initial index received for ID',
        id,
        'Data:',
        data,
        'Initial Viewable Index:',
        initialViewableIndex
      );
      if (data.items.length > 0 && initialViewableIndex === -1) {
        console.warn(
          `Requested job ID ${id} found, but it has no imageKey and cannot be displayed.`
        );
        return { items: [], initialIndex: -1 };
      }
      throw new Error('Invalid data format or initial index received.');
    }

    if (data.items.length === 0 || viewableItems.length === 0) {
      return { items: [], initialIndex: -1 };
    }

    return {
      items: viewableItems,
      initialIndex: initialViewableIndex,
    };
  } catch (error) {
    console.error('Error fetching job details:', error);
    throw error;
  }
}

const GalleryDetailScreen = () => {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();

  const [jobs, setJobs] = useState<SelectGeneratorJob[]>([]);
  const [initialViewerIndex, setInitialViewerIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMoreBefore, setLoadingMoreBefore] = useState(false);
  const [loadingMoreAfter, setLoadingMoreAfter] = useState(false);
  const [hasMoreBefore, setHasMoreBefore] = useState(true);
  const [hasMoreAfter, setHasMoreAfter] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false); // New state for download loading

  const bottomSheetRef = useRef<BottomSheet>(null);
  // Set initial sheet index to -1 to keep it closed
  const [sheetIndex, setSheetIndex] = useState<number>(-1);

  const snapPoints = useMemo(() => ['20%', '50%', '80%'], []);

  const bottomSheetBackgroundStyle = useMemo(() => {
    const resolvedColor = getVariableValue(theme.color2);
    const translucentColor = hexToRgba(resolvedColor, 0.9);

    return {
      backgroundColor: translucentColor,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    };
  }, [theme.color2]);

  const imageSources: IImageInfo[] = useMemo(() => {
    if (!jobs || jobs.length === 0 || !BACKEND_URL) return [];
    return jobs.map((job) => {
      return {
        url: `${BACKEND_URL}/api/v1/images/${encodeURIComponent(job.imageKey!)}`,
        props: {
          jobId: job.id,
        },
      };
    });
  }, [jobs, BACKEND_URL]);

  const currentJob = useMemo(() => {
    if (
      !jobs ||
      !imageSources ||
      currentIndex === null ||
      currentIndex < 0 ||
      currentIndex >= imageSources.length
    ) {
      return null;
    }

    const currentImageInfo = imageSources[currentIndex];
    const currentJobId = currentImageInfo.props?.jobId;

    if (currentJobId) {
      return jobs.find((job) => job.id === currentJobId) || null;
    }

    return null;
  }, [jobs, imageSources, currentIndex]);

  const currentImageUrl = useMemo(() => {
    if (imageSources.length > 0 && currentIndex !== null && currentIndex < imageSources.length) {
      return imageSources[currentIndex]?.url;
    }
    return null;
  }, [imageSources, currentIndex]);

  const fetchInitialJobs = useCallback(async () => {
    // ... (fetchInitialJobs function remains the same)
    if (!id || typeof id !== 'string' || !BACKEND_URL) {
      setError(id ? 'Backend URL is not configured.' : 'Invalid image ID provided.');
      setLoadingInitial(false);
      return;
    }

    try {
      setLoadingInitial(true);
      setError(null);
      setJobs([]);
      setInitialViewerIndex(null);
      setCurrentIndex(0);
      setHasMoreBefore(true);
      setHasMoreAfter(true);
      setSheetIndex(-1); // Ensure sheet is closed on new fetch

      const result = await getJobDetailsWithNeighbors(id, {
        limitBefore: INITIAL_LOAD_LIMIT_BEFORE,
        limitAfter: INITIAL_LOAD_LIMIT_AFTER,
      });

      if (
        result?.items &&
        result.items.length > 0 &&
        result.initialIndex !== null &&
        result.initialIndex !== -1
      ) {
        const fetchedJobs = result.items;
        const viewerInitialIndex = result.initialIndex;

        setJobs(fetchedJobs);
        setInitialViewerIndex(viewerInitialIndex);
        setCurrentIndex(viewerInitialIndex);
      } else {
        console.error(
          'Initial fetch returned no viewable items or invalid data for ID:',
          id,
          'Result:',
          result
        );
        setError('Could not retrieve viewable image data or the requested image was not found.');
        setJobs([]);
        setInitialViewerIndex(null);
        setCurrentIndex(0);
      }
    } catch (err: any) {
      console.error('Failed to fetch initial job details:', err);
      setError('Failed to load image details: ' + (err.message || 'Unknown error'));
      setJobs([]);
      setInitialViewerIndex(null);
      setCurrentIndex(0);
    } finally {
      setLoadingInitial(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInitialJobs();
  }, [fetchInitialJobs]);

  // ... (handleLoadMoreBefore and handleLoadMoreAfter functions remain the same)
  const handleLoadMoreBefore = useCallback(async () => {
    if (loadingMoreBefore || !hasMoreBefore || jobs.length === 0 || !BACKEND_URL) {
      return;
    }

    setLoadingMoreBefore(true);
    const firstJobId = jobs[0]?.id;

    if (!firstJobId) {
      setHasMoreBefore(false);
      setLoadingMoreBefore(false);
      return;
    }

    try {
      const result = await getJobDetailsWithNeighbors(firstJobId, {
        limitBefore: DYNAMIC_LOAD_LIMIT,
        limitAfter: 1,
      });

      if (result?.items && result.items.length > 0) {
        const fetchedItems = result.items;
        const edgeIndexInNewBatch = fetchedItems.findIndex((job) => job.id === firstJobId);

        const itemsToPrepend =
          edgeIndexInNewBatch !== -1 ? fetchedItems.slice(0, edgeIndexInNewBatch) : fetchedItems;

        const currentJobIds = new Set(jobs.map((job) => job.id));
        const finalItemsToPrepend = itemsToPrepend.filter((job) => !currentJobIds.has(job.id));

        if (finalItemsToPrepend.length > 0) {
          setJobs((prevJobs) => [...finalItemsToPrepend, ...prevJobs]);
          setCurrentIndex((prevIndex) => prevIndex + finalItemsToPrepend.length);
          if (itemsToPrepend.length < DYNAMIC_LOAD_LIMIT) {
            setHasMoreBefore(false);
          }
        } else {
          setHasMoreBefore(false);
        }
      } else {
        setHasMoreBefore(false);
      }
    } catch (error) {
      console.error('Error loading more images before:', error);
      setHasMoreBefore(false);
    } finally {
      setLoadingMoreBefore(false);
    }
  }, [loadingMoreBefore, hasMoreBefore, jobs, BACKEND_URL]);

  const handleLoadMoreAfter = useCallback(async () => {
    if (loadingMoreAfter || !hasMoreAfter || jobs.length === 0 || !BACKEND_URL) {
      return;
    }

    setLoadingMoreAfter(true);
    const lastJobId = jobs[jobs.length - 1]?.id;

    if (!lastJobId) {
      setHasMoreAfter(false);
      setLoadingMoreAfter(false);
      return;
    }

    try {
      const result = await getJobDetailsWithNeighbors(lastJobId, {
        limitBefore: 1,
        limitAfter: DYNAMIC_LOAD_LIMIT,
      });

      if (result?.items && result.items.length > 0) {
        const fetchedItems = result.items;
        const edgeIndexInNewBatch = fetchedItems.findIndex((job) => job.id === lastJobId);

        const itemsToAppend =
          edgeIndexInNewBatch !== -1 && edgeIndexInNewBatch < fetchedItems.length - 1
            ? fetchedItems.slice(edgeIndexInNewBatch + 1)
            : fetchedItems.filter((job) => job.id !== lastJobId);

        const currentJobIds = new Set(jobs.map((job) => job.id));
        const finalItemsToAppend = itemsToAppend.filter((job) => !currentJobIds.has(job.id));

        if (finalItemsToAppend.length > 0) {
          setJobs((prevJobs) => [...prevJobs, ...finalItemsToAppend]);
          if (itemsToAppend.length < DYNAMIC_LOAD_LIMIT) {
            setHasMoreAfter(false);
          }
        } else {
          setHasMoreAfter(false);
        }
      } else {
        setHasMoreAfter(false);
      }
    } catch (error) {
      console.error('Error loading more images after:', error);
      setHasMoreAfter(false);
    } finally {
      setLoadingMoreAfter(false);
    }
  }, [loadingMoreAfter, hasMoreAfter, jobs, BACKEND_URL]);

  useEffect(() => {
    if (loadingInitial || jobs.length === 0 || imageSources.length === 0 || currentIndex === null)
      return;

    const loadThreshold = 5;

    if (
      !loadingMoreBefore &&
      hasMoreBefore &&
      currentIndex < loadThreshold &&
      imageSources.length > loadThreshold
    ) {
      handleLoadMoreBefore();
    }

    const distanceToEnd = imageSources.length - 1 - currentIndex;
    if (
      !loadingMoreAfter &&
      hasMoreAfter &&
      distanceToEnd < loadThreshold &&
      distanceToEnd >= 0 &&
      imageSources.length > loadThreshold
    ) {
      handleLoadMoreAfter();
    }
  }, [
    currentIndex,
    imageSources.length,
    loadingInitial,
    loadingMoreBefore,
    loadingMoreAfter,
    hasMoreBefore,
    hasMoreAfter,
    handleLoadMoreBefore,
    handleLoadMoreAfter,
    jobs.length,
  ]);

  // New download function
  const handleDownloadImage = useCallback(async () => {
    if (!currentImageUrl) {
      Alert.alert('Error', 'No image URL available to download.');
      return;
    }
    setIsDownloading(true);

    try {
      // 1. Request Media Library Permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant access to your media library to save the image.'
        );
        return;
      }

      // 2. Define download destination (cache directory is good for temporary files)
      // Extract file extension if possible, default to jpg
      const fileExtension = currentImageUrl.split('.').pop()?.split('?')[0] || 'jpg';
      const filename = `image_${currentJob?.id || Date.now()}.${fileExtension}`;
      const downloadDest = FileSystem.cacheDirectory + filename;

      console.log(`Attempting to download from ${currentImageUrl} to ${downloadDest}`);

      // 3. Download the image
      const downloadResult = await FileSystem.downloadAsync(
        currentImageUrl,
        downloadDest
        // Add headers here if your image URL requires authentication
        // , { headers: { 'Authorization': 'Bearer your_token' } }
      );

      if (downloadResult.status !== 200) {
        console.error('Download failed:', downloadResult);
        throw new Error(`Failed to download image: Status ${downloadResult.status}`);
      }

      console.log(`Download successful: ${downloadResult.uri}`);

      // 4. Create an asset in the device's media library
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      console.log('Asset created:', asset);

      // Optional: Add asset to a specific album (e.g., Camera Roll) - on iOS it's default
      // For Android, you might add it to a custom album:
      // const albumName = 'My App Images'; // Choose an album name
      // const album = await MediaLibrary.getAlbumAsync(albumName);
      // if (album == null) {
      //   await MediaLibrary.createAlbumAsync(albumName, asset, false);
      // } else {
      //   await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      // }

      Alert.alert('Success', 'Image saved to your photos!');

      // Optional: Clean up the temporary file after saving
      // await FileSystem.deleteAsync(downloadResult.uri);
    } catch (error: any) {
      console.error('Download/Save Error:', error);
      Alert.alert('Error', 'Failed to save image: ' + (error.message || 'Unknown error'));
    } finally {
      setIsDownloading(false);
    }
  }, [currentImageUrl, currentJob?.id]); // Depend on the current image URL and job ID

  // ... (renderInfo function remains the same)
  const renderInfo = (info: InfoParsedResult | null | undefined) => {
    if (!info) {
      return (
        <SizableText color="$gray10" size="$4" textAlign="center" p="$4">
          No detailed generation info available.
        </SizableText>
      );
    }

    const displayKeys: Array<keyof InfoParsedResult> = [
      'prompt',
      'negative_prompt',
      'sd_model_name',
      'sd_vae_name',
      'sampler_name',
      'steps',
      'cfg_scale',
      'seed',
      'width',
      'height',
      'clip_skip',
      'batch_size',
      'denoising_strength',
      'restore_faces',
      'face_restoration_model',
      'styles',
      'job_timestamp',
      'version',
      'extra_generation_params',
    ];

    const yStackKeys = ['prompt', 'negative_prompt', 'extra_generation_params'];

    return (
      <YStack gap="$3" pb="$5">
        <H2 size="$6">Generation Details</H2>
        <Separator />

        {yStackKeys.map((key) => {
          const value = info[key as keyof InfoParsedResult];
          if (
            value == null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'object' && Object.keys(value).length === 0)
          )
            return null;

          const displayKey = String(key)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .trim()
            .split(' ')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          let displayValue;
          if (key === 'extra_generation_params' && typeof value === 'object') {
            displayValue = JSON.stringify(value, null, 2);
            return (
              <YStack key={String(key)} space="$1">
                <SizableText fontWeight="bold">{displayKey}:</SizableText>
                <SizableText fontSize="$2" color="$gray9">
                  {displayValue}
                </SizableText>
              </YStack>
            );
          } else if (typeof value === 'object') {
            displayValue = JSON.stringify(value);
          } else {
            displayValue = String(value);
          }

          return (
            <YStack key={String(key)} space="$1">
              <SizableText fontWeight="bold">{displayKey}:</SizableText>
              <SizableText>{displayValue}</SizableText>
            </YStack>
          );
        })}

        {(info.prompt || info.negative_prompt) && <Separator />}

        {displayKeys
          .filter((key) => !yStackKeys.includes(key))
          .map((key) => {
            const value = info[key];

            if (value == null || value === '' || (Array.isArray(value) && value.length === 0))
              return null;

            let displayValue;
            if (Array.isArray(value)) {
              displayValue = value.join(', ');
            } else if (typeof value === 'boolean') {
              displayValue = value ? 'Yes' : 'No';
            } else if (key === 'job_timestamp' && typeof value === 'string') {
              try {
                const date = new Date(value);
                displayValue = date.toLocaleString();
                if (displayValue === 'Invalid Date') displayValue = value;
              } catch (e) {
                displayValue = value;
              }
            } else {
              displayValue = String(value);
            }

            const displayKey = String(key)
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/_/g, ' ')
              .trim()
              .split(' ')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            return (
              <XStack key={String(key)} space="$2" flexWrap="wrap" ai="flex-start">
                <SizableText fontWeight="bold" flexShrink={0}>
                  {displayKey}:
                </SizableText>
                <SizableText flex={1} flexWrap="wrap">
                  {displayValue}
                </SizableText>
              </XStack>
            );
          })}
      </YStack>
    );
  };

  if (
    loadingInitial ||
    error ||
    jobs.length === 0 ||
    imageSources.length === 0 ||
    initialViewerIndex === null
  ) {
    // ... (Loading/Error state rendering remains the same)
    return (
      <View flex={1} justifyContent="center" alignItems="center" bg="$background">
        {loadingInitial && (
          <>
            <Spinner size="large" color="$green10" />
            <SizableText mt="$3" size="$4">
              Loading image and neighbors...
            </SizableText>
          </>
        )}
        {error && (
          <SizableText color="$red10" textAlign="center" size="$4" p="$4">
            {error}
          </SizableText>
        )}
        {!loadingInitial && !error && (jobs.length === 0 || imageSources.length === 0) && (
          <SizableText textAlign="center" size="$4" p="$4">
            {jobs.length === 0
              ? 'No image data available.'
              : 'Image details not found or no viewable images available.'}
          </SizableText>
        )}
        {!loadingInitial && (error || jobs.length === 0 || imageSources.length === 0) && (
          <Button
            mt="$4"
            onPress={() => {
              router.back();
            }}>
            Go Back
          </Button>
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {currentImageUrl && (
          <View style={StyleSheet.absoluteFillObject}>
            <RNImage
              source={{ uri: currentImageUrl }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              blurRadius={50}
            />
            <View style={styles.overlay} />
          </View>
        )}

        <ImageViewer
          imageUrls={imageSources}
          index={initialViewerIndex}
          enableSwipeDown={false}
          onChange={(index?: number) => {
            if (index !== undefined && index !== null) {
              setCurrentIndex(index);
            }
          }}
          backgroundColor="transparent"
          renderIndicator={() => <></>}
          style={{ flex: 1 }}
          saveToLocalByLongPress={false}
          renderFooter={() => <></>}
        />

        {/* Close Button (already exists) */}
        <Button
          onPress={() => router.back()}
          icon={<X />}
          size="$3"
          position="absolute"
          top="$4"
          right="$4"
          zIndex={10}
          circular
          opacity={0.8}
          theme="dark"
        />

        {/* === NEW Download Button === */}
        <Button
          onPress={handleDownloadImage}
          icon={isDownloading ? <Spinner size="small" color="$color" /> : <Download />}
          size="$3"
          position="absolute"
          top="$4" // Align vertically with close button
          left="$4" // Position on the left side
          zIndex={10} // Ensure it's above the image viewer
          circular
          opacity={isDownloading ? 0.5 : 0.8} // Indicate loading state
          disabled={isDownloading || !currentImageUrl} // Disable while loading or if no image
          theme="dark" // Use dark theme for visibility
        />
        {/* ========================== */}

        {sheetIndex === -1 && (
          <Button
            onPress={() => bottomSheetRef.current?.snapToIndex(0)}
            icon={<ChevronUp />}
            size="$3"
            position="absolute"
            bottom="$4"
            alignSelf="center"
            zIndex={100}
            circular
            opacity={0.8}
            theme="dark"
          />
        )}

        <Theme name="dark">
          <BottomSheet
            ref={bottomSheetRef}
            // Set initial index to -1 to make it closed by default
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose={true}
            handleIndicatorStyle={{ backgroundColor: '$gray10' }}
            backgroundStyle={bottomSheetBackgroundStyle}
            onChange={setSheetIndex}>
            <BottomSheetScrollView contentContainerStyle={styles.bottomSheetContent}>
              {renderInfo(currentJob?.generationInfo)}

              {(loadingMoreBefore || loadingMoreAfter) && (
                <YStack alignItems="center" p="$3" space="$2">
                  <Spinner size="small" color="$green10" />
                  <SizableText size="$3" color="$gray10">
                    Loading more images...
                  </SizableText>
                </YStack>
              )}
              {!hasMoreBefore &&
                currentIndex === 0 &&
                !loadingInitial &&
                imageSources.length > 1 && (
                  <SizableText size="$3" color="$gray10" textAlign="center" p="$3">
                    Reached the beginning.
                  </SizableText>
                )}
              {!hasMoreAfter &&
                currentIndex === imageSources.length - 1 &&
                !loadingInitial &&
                imageSources.length > 1 && (
                  <SizableText size="$3" color="$gray10" textAlign="center" p="$3">
                    Reached the end.
                  </SizableText>
                )}
              {imageSources.length <= 1 && !loadingInitial && (
                <SizableText size="$3" color="$gray10" textAlign="center" p="$3">
                  This is the only image.
                </SizableText>
              )}
            </BottomSheetScrollView>
          </BottomSheet>
        </Theme>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bottomSheetContent: {
    padding: 20,
    paddingBottom: 50,
  },
});

export default GalleryDetailScreen;
