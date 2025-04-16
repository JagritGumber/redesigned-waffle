import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Modal,
} from 'react-native'; // Using ScrollView from react-native for broader compatibility
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Progress, Image, Button, ScrollView, View, Text } from 'tamagui';
import { Model, ModelVersion, FileVersion } from '~/types/civitai';
import axios from 'axios';
import RenderHTML from 'react-native-render-html';
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import { X } from '@tamagui/lucide-icons';
import ImageViewer from 'react-native-image-zoom-viewer';
import ModelDownloadButton from "~/components/ModelDownloadButton";
import { useModelStore } from '~/store/useModalStore'; // Adjust path
import { formatBytes } from '~/utils/formatBytes'; // Assuming you have a utility for formatting bytes

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ModelDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [localModel, setLocalModel] = useState<Model | null>(null); // Use a different name
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const carouselRef = useRef<ICarouselInstance>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [isCarouselDragging, setIsCarouselDragging] = useState<boolean>(false);

  const { selectedModel } = useModelStore();

  useEffect(() => {
    // If we have a selected model from the store, use it
    if (selectedModel && selectedModel.id.toString() === id) {
      setLocalModel(selectedModel);
      setLoading(false);
    } else {
      // Otherwise, fetch the model details
      const fetchModelDetails = async () => {
        setLoading(true);
        setError(null);
        try {
          const apiUrl = `https://civitai.com/api/v1/models/${id}?token=${process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN}&nsfw=true`;
          const response = await axios.get(apiUrl);
          setLocalModel(response.data);
        } catch (e: any) {
          setError(e.message);
          console.error('Error fetching model details:', e);
        } finally {
          setLoading(false);
        }
      };
      fetchModelDetails();
    }
  }, [id, router, selectedModel]);

  if (loading) {
    return (
      <View style={styles.centered}>
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

  // Extract all image URLs from all model versions
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

  return (
    <ScrollView style={styles.container} nestedScrollEnabled={true}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}>
        <View style={styles.header}>
          <Text style={styles.title}>{modelToDisplay.name}</Text>
          <Text style={styles.type}>Type: {modelToDisplay.type}</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()}>
          <X />
        </TouchableOpacity>
      </View>

      {allImages.length > 0 && (
        <View style={styles.carouselContainer}>
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
          <View style={styles.paginationContainer}>
            <TouchableOpacity onPress={goToPrevious} style={styles.navigationButton}>
              <Text>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToNext} style={styles.navigationButton}>
              <Text>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.detailsContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Creator</Text>
          <View style={styles.creatorInfo}>
            <Image
              source={{ uri: modelToDisplay.creator.image }}
              style={styles.creatorImage}
            />
            <Text style={styles.creatorUsername}>{modelToDisplay.creator.username}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <Text>Downloads: {modelToDisplay.stats.downloadCount}</Text>
          <Text>Favorites: {modelToDisplay.stats.favoriteCount}</Text>
          <Text>Thumbs Up: {modelToDisplay.stats.thumbsUpCount}</Text>
          <Text>Thumbs Down: {modelToDisplay.stats.thumbsDownCount}</Text>
          <Text>Comments: {modelToDisplay.stats.commentCount}</Text>
          <Text>Ratings: {modelToDisplay.stats.ratingCount}</Text>
          <Text>Rating: {modelToDisplay.stats.rating?.toFixed(2) ?? 'N/A'}</Text>
          <Text>Tips: {modelToDisplay.stats.tippedAmountCount}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>License & Usage</Text>
          <Text>No Credit Required: {modelToDisplay.allowNoCredit ? 'Yes' : 'No'}</Text>
          <Text>Commercial Use: {modelToDisplay.allowCommercialUse.join(', ') || 'No'}</Text>
          <Text>Allow Derivatives: {modelToDisplay.allowDerivatives ? 'Yes' : 'No'}</Text>
          <Text>Different License Allowed: {modelToDisplay.allowDifferentLicense ? 'Yes' : 'No'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <Text>{modelToDisplay.tags.join(', ') || 'No tags available'}</Text>
        </View>

        {modelToDisplay.modelVersions && modelToDisplay.modelVersions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Model Versions</Text>
            {modelToDisplay.modelVersions.map((version: ModelVersion) => (
              <View key={version.id} style={styles.modelVersionContainer}>
                <Text style={styles.modelVersionName}>{version.name} (Base: {version.baseModel})</Text>
                <Text>Published At: {new Date(version.publishedAt).toLocaleDateString()}</Text>
                <Text>Availability: {version.availability}</Text>
                <Text>NSFW Level: {version.nsfwLevel}</Text>
                {version.description && (
                  <RenderHTML contentWidth={width} source={{ html: version.description }} />
                )}

                {version.files && version.files.length > 0 && (
                  <View style={styles.filesContainer}>
                    <Text style={styles.filesTitle}>Files</Text>
                    {version.files.map((file: FileVersion) => (
                      <View key={file.id} style={styles.fileItem}>
                        <Text style={styles.fileName}>{file.name}</Text>
                        <Text>Size: {formatBytes(file.sizeKB * 1024)}</Text>
                        <Text>Type: {file.type}</Text>
                        <Text>Format: {file.metadata?.format || 'N/A'}</Text>
                        {file.metadata?.size && <Text>Raw Size: {file.metadata.size}</Text>}
                        <Text>Pickle Scan: {file.pickleScanResult}</Text>
                        {file.pickleScanMessage && <Text>Pickle Scan Message: {file.pickleScanMessage}</Text>}
                        <Text>Virus Scan: {file.virusScanResult}</Text>
                        {file.virusScanMessage && <Text>Virus Scan Message: {file.virusScanMessage}</Text>}
                        <Text>Scanned At: {new Date(file.scannedAt).toLocaleDateString()}</Text>
                        {file.hashes?.SHA256 && <Text>SHA256: {file.hashes.SHA256.substring(0, 10)}...</Text>}
                        <ModelDownloadButton model={modelToDisplay} />
                        {file.primary && <Text style={styles.primaryFile}>Primary</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {modelToDisplay.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <RenderHTML contentWidth={width} source={{ html: modelToDisplay.description }} />
          </View>
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
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setModalVisible(false)}>
                <X />
              </TouchableOpacity>
            )}
            index={selectedImage}
            enableImageZoom={true}
          />
        )}
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  type: {
    fontSize: 16,
    color: 'gray',
  },
  carouselContainer: {
    height: screenHeight * 0.7, // Adjust as needed
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 16, // Adjust this value to move buttons higher or lower
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  navigationButton: {
    padding: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
  },
  detailsContainer: {
    marginTop: 16,
  },
  section: {
    marginBottom: 16,
    padding: 10,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  creatorImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
  },
  creatorUsername: {
    fontSize: 16,
  },
  modelVersionContainer: {
    marginBottom: 16,
    padding: 10,
    borderColor: '#eee',
    borderWidth: 1,
    borderRadius: 5,
  },
  modelVersionName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  filesContainer: {
    marginTop: 8,
    paddingLeft: 10,
  },
  filesTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  fileItem: {
    marginBottom: 8,
    padding: 8,
    borderColor: '#f9f9f9',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#f9f9f9',
  },
  fileName: {
    fontWeight: 'bold',
  },
  primaryFile: {
    color: 'green',
    fontWeight: 'bold',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    padding: 8,
    borderRadius: 15,
    zIndex: 2, // Ensure it's above the image viewer
  },
  modalCloseButtonText: {
    color: 'white',
    fontSize: 16,
  },
});

export default ModelDetailScreen;
