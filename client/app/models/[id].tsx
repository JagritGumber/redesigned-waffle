import { useState, useEffect, useRef, useCallback } from 'react';
import { Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Progress, Image, ScrollView, View, Text, useTheme, Button, AlertDialog } from 'tamagui';
import { Model, FileVersion } from '~/types/civitai';
import axios from 'axios';
import RenderHTML from 'react-native-render-html';
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import { X } from '@tamagui/lucide-icons';
import ImageViewer from 'react-native-image-zoom-viewer';
import ModelDownloadButton from '~/components/ModelDownloadButton';
import { useModelStore } from '~/store/useModelStore';
import { formatBytes } from '~/utils/formatBytes';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import fetchModelById from '~/utils/fetchModelById';
import ModelDeleteButton from '~/components/ModelDeleteButton';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ModelDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [localModel, setLocalModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const carouselRef = useRef<ICarouselInstance>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloadedModel, setDownloadedModel] = useState<CivitaiModelWithRelations | null>(null);
  const [isModalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [isCarouselDragging, setIsCarouselDragging] = useState<boolean>(false);

  const { selectedModel } = useModelStore();
  const theme = useTheme();

  const handleModelUpdate = useCallback(() => {
    if (id) {
      fetchModelById(id, setDownloadedModel);
    }
  }, [id]); // useCallback with id as dependency

  useEffect(() => {
    if (selectedModel && selectedModel.id.toString() === id) {
      setLocalModel(selectedModel);
      fetchModelById(id, setDownloadedModel);
      setLoading(false);
    } else {
      const fetchModelDetails = async () => {
        setLoading(true);
        setError(null);
        try {
          const apiUrl = `https://civitai.com/api/v1/models/${id}?token=${process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN}&nsfw=true`;
          const response = await axios.get(apiUrl);
          setLocalModel(response.data);
          return response.data;
        } catch (e: any) {
          setError(e.message);
          console.error('Error fetching model details:', e);
        } finally {
          setLoading(false);
        }
      };
      fetchModelDetails()
        .then(({ id }) => {
          fetchModelById(id, setDownloadedModel); // Initial fetch of downloadedModel
        })
        .catch((err) => {
          console.error('Error while trying to fetch this model from civitAi', err);
        });
    }
  }, [id, router, selectedModel]);

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
    }, // Add more styles as needed for other HTML elements
  };

  if (loading) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Progress size="large" />
      </View>
    );
  }

  if (error) {
    return <Text>Error loading model details: {error}</Text>;
  }

  const modelToDisplay = localModel || selectedModel;

  if (!modelToDisplay) {
    return <Text>Model not found.</Text>;
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

  const handleDelete = () => {
    async () => {
      setLoading(true); // Show loading indicator during deletion
      setError(null); // Clear any previous errors
      try {
        if (!id) {
          setError('Model ID is missing.');
          return;
        }
        await axios.delete(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${id}`); // Call the DELETE route
        console.log(`Model with ID ${id} deleted successfully`);
      } catch (err: any) {
        setError(err.response?.data?.error || err.message || 'Failed to delete model.');
        console.error('Error deleting model:', err);
      } finally {
        setLoading(false); // Hide loading indicator
      }
    };
  };

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

  // Get the latest model version
  const latestVersion = modelToDisplay.modelVersions?.[modelToDisplay.modelVersions.length - 1];

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
        </View>
      )}

      <View marginTop={16}>
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

        {latestVersion && (
          <>
            <Text fontSize={16} fontWeight="bold" marginBottom={8}>
              {latestVersion.name} (Base: {latestVersion.baseModel})
            </Text>
            <Text>Published At: {new Date(latestVersion.publishedAt).toLocaleDateString()}</Text>
            <Text>Availability: {latestVersion.availability}</Text>
            <Text>NSFW Level: {latestVersion.nsfwLevel}</Text>
            {latestVersion.description && (
              <RenderHTML
                contentWidth={width}
                source={{ html: latestVersion.description }}
                tagsStyles={htmlStyles}
              />
            )}

            {latestVersion.files && latestVersion.files.length > 0 && (
              <View marginTop={8}>
                <Text fontWeight="bold" marginBottom={4}>
                  Files
                </Text>
                {latestVersion.files.map((file: FileVersion) => (
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
                    <ModelDownloadButton model={modelToDisplay} />
                    {downloadedModel ? <ModelDeleteButton model={downloadedModel} /> : null}
                    {file.primary && (
                      <Text color="green" fontWeight="bold">
                        Primary
                      </Text>
                    )}
                  </View>
                ))}
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
