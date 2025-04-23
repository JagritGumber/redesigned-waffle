// ./app/model/[id].tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Progress, Image, ScrollView, View, Text, useTheme, Button, AlertDialog } from 'tamagui';
import { Model as CivitaiApiModel, FileVersion, Model } from '~/types/civitai'; // Use alias for Civitai API Model
import axios from 'axios';
import RenderHTML from 'react-native-render-html';
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import { X } from '@tamagui/lucide-icons';
import ImageViewer from 'react-native-image-zoom-viewer';
import ModelDownloadButton from '~/components/ModelDownloadButton';
import { formatBytes } from '~/utils/formatBytes';
import { useGetDownloadedModel } from '~/hooks/useGetDownloadedModel'; // Import the custom hook
import ModelDeleteButton from '~/components/ModelDeleteButton';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ModelDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>(); // Civitai ID as string
  const router = useRouter();
  const [civitaiModel, setCivitaiModel] = useState<CivitaiApiModel | null>(null); // Data directly from Civitai API
  const [loadingCivitai, setLoadingCivitai] = useState<boolean>(true); // Loading state for Civitai fetch
  const [civitaiError, setCivitaiError] = useState<string | null>(null); // Error state for Civitai fetch

  const carouselRef = useRef<ICarouselInstance>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [isCarouselDragging, setIsCarouselDragging] = useState<boolean>(false);

  const theme = useTheme();

  // Use TanStack Query to fetch the model data from YOUR backend
  const {
    downloadedModel, // This is the data from YOUR backend DB (CivitaiModelWithRelations)
    isLoading: isLoadingDownloadedModel, // Loading state from TanStack Query
    error: downloadedModelError, // Error state from TanStack Query
    // We don't need manual re-fetch handlers because invalidateQueries handles it
  } = useGetDownloadedModel(id);

  // Effect to fetch initial Civitai API data (only once on mount or id change)
  useEffect(() => {
    if (!id) {
      setLoadingCivitai(false);
      setCivitaiError('Model ID is missing.');
      return;
    }

    const fetchCivitaiDetails = async () => {
      setLoadingCivitai(true);
      setCivitaiError(null);
      try {
        // Use the id from route params (which is the Civitai ID)
        const apiUrl = `https://civitai.com/api/v1/models/${id}?token=${process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN}&nsfw=true`;
        const response = await axios.get<CivitaiApiModel>(apiUrl);
        setCivitaiModel(response.data);
      } catch (e: any) {
        setCivitaiError(e.message);
        console.error('Error fetching Civitai model details:', e);
      } finally {
        setLoadingCivitai(false);
      }
    };

    fetchCivitaiDetails();
  }, [id]); // Depend only on id

  const htmlStyles = {
    p: {
      fontSize: 16,
      color: theme.color.get(),
      marginBottom: 8,
    },
    h1: {
      fontSize: 22,
      fontWeight: 'bold' as 'bold',
      color: theme.color.get(),
      marginBottom: 12,
    },
    h2: {
      fontSize: 20,
      fontWeight: 'bold' as 'bold',
      color: theme.color.get(),
      marginBottom: 10,
    },
    h3: {
      fontSize: 18,
      fontWeight: 'bold' as 'bold',
      color: theme.color.get(),
      marginBottom: 8,
    },
    ul: {
      marginBottom: 8,
    },
    li: {
      fontSize: 16,
      color: theme.color.get(),
      marginLeft: 16,
      marginBottom: 4,
    },
    a: {
      color: theme.accent10.get(),
    },
  };

  // Show loading indicator if either Civitai data or backend data is loading
  if (loadingCivitai || isLoadingDownloadedModel) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Progress size="large" />
      </View>
    );
  }

  // Show error if Civitai fetch failed OR backend fetch failed
  if (civitaiError) {
    return <Text>Error loading Civitai model details: {civitaiError}</Text>;
  }
  if (downloadedModelError) {
    return (
      <Text>
        Error loading local model status: {downloadedModelError.message || 'Unknown error'}
      </Text>
    );
  }

  const modelToDisplay = civitaiModel; // Use the full Civitai data for display

  if (!modelToDisplay) {
    return <Text>Model data not found.</Text>;
  }

  const { width } = Dimensions.get('window');

  const allImages =
    modelToDisplay.modelVersions?.reduce((acc, version) => {
      if (version.images) {
        return acc.concat(version.images.map((img) => img.url));
      }
      return acc;
    }, [] as string[]) || [];

  const handleImagePress = (imageIndex: number) => {
    if (!isCarouselDragging) {
      setSelectedImage(imageIndex);
      setModalVisible(true);
    }
  };

  // The delete logic should be handled by the ModelDeleteButton component itself,
  // using its internal mutation hook. We don't need a handleDelete function here anymore.
  // const handleDelete = () => { ... };

  const renderItem = ({ item, index }: { item: string; index: number }) => (
    <TouchableOpacity
      onPress={() => handleImagePress(index)}
      style={{ width: screenWidth, justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={{ uri: item }}
        width={screenWidth * 0.8}
        height={screenHeight * 0.6}
        resizeMode={'contain'}
      />
    </TouchableOpacity>
  );

  const goToPrevious = () => {
    carouselRef.current?.prev();
  };

  const goToNext = () => {
    carouselRef.current?.next();
  };

  // Get the latest model version from Civitai data for display
  // We need the latest version from the *downloadedModel* to get the file status
  const latestCivitaiVersion = modelToDisplay.modelVersions?.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )[0];

  // Find the corresponding latest version in the downloadedModel to get file status
  const latestDownloadedVersion = downloadedModel?.versions?.find(
    (v) => v.civitaiVersionId === latestCivitaiVersion?.id
  );

  return (
    <ScrollView flex={1} padding={16} bg={'$background'}>
      <View flexDirection="row" justifyContent="space-between">
        <View marginBottom={16}>
          <Text fontSize={24} fontWeight="bold" marginBottom={8}>
            {modelToDisplay.name}
          </Text>
          <Text fontSize={16} color={theme.color7.get()}>
            Type: {modelToDisplay.type}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.back()}>
          <X />
        </TouchableOpacity>
      </View>

      {allImages.length > 0 && (
        <View
          height={screenHeight * 0.7}
          marginBottom={16}
          alignItems="center"
          justifyContent="center">
          <Carousel
            ref={carouselRef}
            loop={false}
            width={screenWidth}
            height={screenHeight * 0.7}
            data={allImages}
            renderItem={renderItem}
            onSnapToItem={(index) => setCurrentIndex(index)}
            onScrollStart={() => setIsCarouselDragging(true)}
            onScrollEnd={() => setIsCarouselDragging(false)}
          />
          {/* Image index indicator */}
          {allImages.length > 1 && (
            <Text position="absolute" bottom={8} left={screenWidth / 2 - 10}>
              {currentIndex + 1}/{allImages.length}
            </Text>
          )}
          {/* Navigation buttons (optional, carousel gestures often suffice) */}
          {/*
          <View
            position="absolute"
            bottom={16}
            left={0}
            right={0}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            paddingHorizontal={16}>
            <TouchableOpacity
              onPress={goToPrevious}
              style={{ padding: 10, backgroundColor: theme.background02.get(), borderRadius: 5 }}>
              <Text>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goToNext}
              style={{ padding: 10, backgroundColor: theme.background02.get(), borderRadius: 5 }}>
              <Text>Next</Text>
            </TouchableOpacity>
          </View>
          */}
        </View>
      )}

      <View marginTop={16}>
        {/* ... Creator, Stats, License, Tags views (these use civitaiModel) ... */}

        <View
          marginBottom={16}
          padding={10}
          borderColor={theme.borderColor.get()}
          borderWidth={1}
          borderRadius={5}>
          <Text fontSize={18} fontWeight="bold" marginBottom={8}>
            Creator
          </Text>
          <View flexDirection="row" alignItems="center" marginBottom={8}>
            <Image
              source={{ uri: modelToDisplay.creator.image }}
              width={30}
              height={30}
              borderRadius={15}
              marginRight={8}
            />
            <Text fontSize={16}>{modelToDisplay.creator.username}</Text>
          </View>
        </View>

        <View
          marginBottom={16}
          padding={10}
          borderColor={theme.borderColor.get()}
          borderWidth={1}
          borderRadius={5}>
          <Text fontSize={18} fontWeight="bold" marginBottom={8}>
            Stats
          </Text>
          <Text>Downloads: {modelToDisplay.stats.downloadCount}</Text>
          <Text>Favorites: {modelToDisplay.stats.favoriteCount}</Text>
          <Text>Thumbs Up: {modelToDisplay.stats.thumbsUpCount}</Text>
          <Text>Thumbs Down: {modelToDisplay.stats.thumbsDownCount}</Text>
          <Text>Comments: {modelToDisplay.stats.commentCount}</Text>
          <Text>Ratings: {modelToDisplay.stats.ratingCount}</Text>
          <Text>Rating: {modelToDisplay.stats.rating?.toFixed(2) ?? 'N/A'}</Text>
          <Text>Tips: {modelToDisplay.stats.tippedAmountCount}</Text>
        </View>

        <View
          marginBottom={16}
          padding={10}
          borderColor={theme.borderColor.get()}
          borderWidth={1}
          borderRadius={5}>
          <Text fontSize={18} fontWeight="bold" marginBottom={8}>
            License & Usage
          </Text>
          <Text>No Credit Required: {modelToDisplay.allowNoCredit ? 'Yes' : 'No'}</Text>
          <Text>Commercial Use: {modelToDisplay.allowCommercialUse.join(', ') || 'No'}</Text>
          <Text>Allow Derivatives: {modelToDisplay.allowDerivatives ? 'Yes' : 'No'}</Text>
          <Text>
            Different License Allowed: {modelToDisplay.allowDifferentLicense ? 'Yes' : 'No'}
          </Text>
        </View>

        <View
          marginBottom={16}
          padding={10}
          borderColor={theme.borderColor.get()}
          borderWidth={1}
          borderRadius={5}>
          <Text fontSize={18} fontWeight="bold" marginBottom={8}>
            Tags
          </Text>
          <Text>{modelToDisplay.tags.join(', ') || 'No tags available'}</Text>
        </View>

        {latestCivitaiVersion && (
          <>
            <Text fontSize={16} fontWeight="bold" marginBottom={8}>
              {latestCivitaiVersion.name} (Base: {latestCivitaiVersion.baseModel})
            </Text>
            <Text>
              Published At: {new Date(latestCivitaiVersion.publishedAt).toLocaleDateString()}
            </Text>
            <Text>Availability: {latestCivitaiVersion.availability}</Text>
            <Text>NSFW Level: {latestCivitaiVersion.nsfwLevel}</Text>
            {latestCivitaiVersion.description && (
              <RenderHTML
                contentWidth={width}
                source={{ html: latestCivitaiVersion.description }}
                tagsStyles={htmlStyles}
              />
            )}

            {latestCivitaiVersion.files && latestCivitaiVersion.files.length > 0 && (
              <View marginTop={8}>
                <Text fontWeight="bold" marginBottom={4}>
                  Files
                </Text>
                {latestCivitaiVersion.files.map((file: FileVersion) => {
                  // Find the corresponding file in the downloadedModel data to get its status
                  const downloadedFile = latestDownloadedVersion?.files?.find(
                    (f) => f.civitaiFileId === file.id
                  );
                  const fileDownloadStatus = downloadedFile?.downloadStatus; // Status from your backend DB

                  return (
                    <View
                      key={file.id}
                      marginBottom={8}
                      padding={8}
                      borderColor={theme.borderColor.get()}
                      borderWidth={1}
                      borderRadius={3}
                      backgroundColor={theme.background02.get()}>
                      <Text fontWeight="bold">{file.name}</Text>
                      <Text>Type: {file.type}</Text>
                      <Text>Size: {formatBytes(file.sizeKB * 1024)}</Text>

                      {/* Pass the original Civitai model data and the downloaded model data to the button */}
                      <ModelDownloadButton
                        civitaiModel={modelToDisplay satisfies Model}
                        downloadedModel={downloadedModel}
                      />

                      {/* Only show delete button if the model exists in our DB (downloadedModel is not null) */}
                      {downloadedModel ? <ModelDeleteButton model={downloadedModel} /> : null}

                      {file.primary && (
                        <Text color="green" fontWeight="bold">
                          Primary
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {modelToDisplay.description && (
          <>
            <Text fontSize={18} fontWeight="bold" my={16}>
              Description
            </Text>
            <RenderHTML
              contentWidth={width}
              source={{ html: modelToDisplay.description }}
              tagsStyles={htmlStyles}
            />
          </>
        )}
      </View>

      {/* Image Viewer Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        onRequestClose={() => setModalVisible(false)}>
        {selectedImage !== null && (
          <ImageViewer
            imageUrls={allImages.map((url) => ({ url }))}
            enableSwipeDown={true}
            onSwipeDown={() => setModalVisible(false)}
            renderHeader={() => (
              <Button
                aspectRatio={1}
                size={'$3'}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  padding: 8,
                  borderRadius: 15,
                  zIndex: 2,
                }}
                icon={<X size={'$3'} />}
                onPress={() => setModalVisible(false)}></Button>
            )}
            index={selectedImage}
            enableImageZoom={true}
          />
        )}
      </Modal>
    </ScrollView>
  );
};

export default ModelDetailScreen;
