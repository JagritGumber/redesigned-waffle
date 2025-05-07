// ./app/model/[id].tsx
import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Dimensions, TouchableOpacity, Modal, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Progress,
  Image,
  View,
  Text,
  useTheme,
  Button,
  useWindowDimensions,
  XStack,
  YStack,
  styled,
  Card,
  Accordion,
} from 'tamagui';
import { Model as CivitaiApiModel, FileVersion, ModelVersion } from '~/types/civitai';
import axios from 'axios';
import RenderHTML from 'react-native-render-html';
import { X, ChevronLeft, ChevronRight } from '@tamagui/lucide-icons';
import ImageViewer from 'react-native-image-zoom-viewer';
import ModelDownloadButton from '~/components/ModelDownloadButton';
import { formatBytes } from '~/utils/formatBytes';
import { useGetDownloadedModel } from '~/hooks/useGetDownloadedModel';
import ModelDeleteButton from '~/components/ModelDeleteButton';
import { Chip } from '~/components/ui/Chip';
import { shortenNumber } from '~/utils/shortenNumber';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';

// Ensure you have installed this:
// `npm install react-native-reanimated react-native-reanimated-carousel` or `yarn add react-native-reanimated react-native-reanimated-carousel`
// Make sure to follow react-native-reanimated installation steps (add plugin to babel.config.js)
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import Animated, { interpolate } from 'react-native-reanimated';

const { width: screenWidth } = Dimensions.get('screen');

// Although CarouselItem is string, defining it helps clarity
type CarouselItem = string;

const NavButton = styled(Button, {
  position: 'absolute',
  top: '50%',
  translateY: -20,
  size: '$2',
  height: '$2',
  width: '$2',
  zIndex: 10,
  pressStyle: {
    opacity: 0.7,
  },
  backgroundColor: '$backgroundHover',
  opacity: 0.8,
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: '$12',
});

const ModelDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [civitaiModel, setCivitaiModel] = useState<CivitaiApiModel | null>(null);
  const [loadingCivitai, setLoadingCivitai] = useState<boolean>(true);
  const [civitaiError, setCivitaiError] = useState<string | null>(null);

  // Use ICarouselInstance type for reanimated-carousel ref
  const carouselRef = useRef<ICarouselInstance>(null);

  // currentIndex now tracks the *internal* carousel index
  const [currentIndex, setCurrentIndex] = useState(0);
  // Add state to track the *original* index for display and modal
  const [currentOriginalIndex, setCurrentOriginalIndex] = useState(0);

  const [isModalVisible, setModalVisible] = useState<boolean>(false);
  // selectedImage now stores the *original* index for the ImageViewer
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  // isCarouselDragging state is still useful for preventing modal opening during drag
  const [isCarouselDragging, setIsCarouselDragging] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<ModelVersion | null>(null);
  // scrollViewRef is fine for the main ScrollView
  const scrollViewRef = useRef<ScrollView>(null);

  const theme = useTheme();

  const {
    downloadedModel,
    isLoading: isLoadingDownloadedModel,
    error: downloadedModelError,
  } = useGetDownloadedModel(id);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // --- Responsive Carousel Dimensions Calculation ---
  // Keep these calculations as they seem intended for responsive layout
  const breakpoint = 768;
  const itemsPerView = windowWidth >= breakpoint ? 2 : 1;
  const itemAspectRatio = 2 / 3; // Width / Height

  const itemInternalPadding = 16;

  // Determine final carousel height (applied to the container View and the Carousel component)
  const finalCarouselHeight = windowHeight * 0.8;

  // The carousel container takes full window width minus screen padding
  const carouselContainerWidth =
    windowWidth > breakpoint ? (finalCarouselHeight / 3) * 4 : windowWidth; // Assuming 8px screen padding on left and right

  // Each item slot width within the container
  const itemSlotWidth = carouselContainerWidth / itemsPerView;

  // The image itself should render within the padded slot
  const imageRenderWidth = itemSlotWidth - itemInternalPadding * 2;
  // The item slot height is the image height plus internal padding top/bottom

  // These are the dimensions passed to the Reanimated Carousel component
  const carouselPropSliderWidth = carouselContainerWidth; // Corresponds to Reanimated Carousel 'width'

  // inactiveSlideScale and inactiveSlideOpacity are used in animationStyle
  const inactiveSlideScale = windowWidth >= breakpoint ? 1 : 0.9;
  const inactiveSlideOpacity = windowWidth >= breakpoint ? 1 : 0.7;
  // --- End Responsive Carousel Dimensions Calculation ---

  const { width: contentWidthForHtml } = Dimensions.get('window');

  const modelToDisplay = civitaiModel;

  // State to hold the original image data (snap-carousel handles duplication internally)
  const [originalImages, setOriginalImages] = useState<string[]>([]);

  // Fetch Civitai data
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
        const apiUrl = `https://civitai.com/api/v1/models/${id}`;
        const response = await axios.get<CivitaiApiModel>(apiUrl);
        setCivitaiModel(response.data);
        const [latestVersion] = response.data.modelVersions.sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
        setSelectedVersion(latestVersion);
      } catch (e: any) {
        setCivitaiError(e.message);
        console.error('Error fetching Civitai model details:', e);
      } finally {
        setLoadingCivitai(false);
      }
    };

    fetchCivitaiDetails();
  }, [id]);

  // Update originalImages when selectedVersion changes
  useEffect(() => {
    const images = selectedVersion?.images?.map((image) => image.url) ?? [];
    setOriginalImages(images);

    // Reset index when images or version changes
    setCurrentIndex(0);
    setCurrentOriginalIndex(0); // Also reset original index
  }, [selectedVersion]); // Depend only on selectedVersion

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

  // Modified handleImagePress: Accepts the *item* (URL)
  const handleImagePress = useCallback(
    (imageUrl: string) => {
      // Only open modal if not currently dragging the carousel and there are images
      if (!isCarouselDragging && originalImages.length > 0) {
        // Find the original index of the clicked image URL
        const originalIndex = originalImages.findIndex((url) => url === imageUrl);
        if (originalIndex !== -1) {
          setSelectedImage(originalIndex);
          setModalVisible(true);
        } else {
          console.warn('Clicked image URL not found in originalImages:', imageUrl);
        }
      }
    },
    [isCarouselDragging, originalImages] // Dependencies: state/props used inside
  );

  // Update button logic to use carouselRef methods - simplified dependencies
  const goToPrevious = useCallback(() => {
    carouselRef.current?.prev(); // Use Reanimated Carousel's prev() method
  }, []); // No dependency on originalImages needed for prev/next methods

  const goToNext = useCallback(() => {
    carouselRef.current?.next(); // Use Reanimated Carousel's next() method
  }, []); // No dependency on originalImages needed for prev/next methods

  // Animation style for inactive items (scale and opacity)
  const animationStyle = useCallback(
    (animationValue: any) => {
      'worklet'; // Required for reanimated worklets
      const scale = interpolate(
        animationValue.value,
        [-1, 0, 1], // Input range: -1 (prev item), 0 (current item), 1 (next item)
        [inactiveSlideScale, 1, inactiveSlideScale] // Output range: scale for each position
      );
      const opacity = interpolate(
        animationValue.value,
        [-1, 0, 1],
        [inactiveSlideOpacity, 1, inactiveSlideOpacity]
      );

      return {
        transform: [{ scale }],
        opacity,
      };
    },
    [inactiveSlideScale, inactiveSlideOpacity] // Dependencies for useCallback
  );

  // Function to update the index states when Carousel snaps
  // This index is the internal index provided by reanimated-carousel
  const onSnapToItem = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      // Map the internal index back to the original index for display and modal
      // Use modulo operator for looping carousels
      const originalIndex = originalImages.length > 0 ? index % originalImages.length : 0;
      setCurrentOriginalIndex(originalIndex);
    },
    [originalImages.length] // Dependency on originalImages length for modulo calculation
  );

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

  if (!modelToDisplay) {
    return <Text>Model data not found.</Text>;
  }

  // Use state variable for rendering
  const hasImages = originalImages.length > 0;

  // Determine if navigation buttons should be shown
  // Show buttons if there's more than one original image (looping is possible/meaningful)
  const showNavButtons = originalImages.length > 1; // Use state variable

  return (
    <GestureHandlerRootView>
      <ScrollView
        ref={scrollViewRef} // Assign ref to the main ScrollView
        scrollEnabled={true}
        style={{
          width: '100%', // Use screenWidth for the main scroll view width
          flex: 1,
          backgroundColor: theme.background.get(),
          padding: 8, // Apply padding to the ScrollView itself
        }}
        // No simultaneousHandlers needed here usually, as vertical ScrollView and horizontal Carousel coexist
      >
        {/* Header, Tags, Versions... */}
        <XStack w="100%" px={'$2'}>
          <YStack mb={8} ai={'baseline'} fs={1} flexShrink={1} flex={1}>
            <Text fos={20} fow="bold" numberOfLines={2}>
              {modelToDisplay.name}
            </Text>
          </YStack>
          <Button
            size={'$3'}
            icon={<X />}
            onPress={() => router.back()}
            fs={1}
            ml={'auto'} // Push to the right
            mr={'$4'}
          />
        </XStack>
        <XStack mb={'$2'} px={'$2'} flexWrap="wrap" gap={'$1'}>
          {modelToDisplay.tags.map((tag) => (
            <Chip key={tag} size={'$1'} bg={'$accentColor'}>
              <Text fos={'$1'} textTransform="uppercase">
                {tag}
              </Text>
            </Chip>
          ))}
        </XStack>

        {/* Versions List - Horizontal Scroll */}
        {modelToDisplay.modelVersions && modelToDisplay.modelVersions.length > 0 && (
          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 8, marginBottom: 16 }} // Add horizontal padding inside
          >
            {modelToDisplay.modelVersions.map((version) => (
              <Button
                key={version.id}
                size={'$2'}
                bg={
                  selectedVersion?.name === version.name ? '$backgroundFocus' : '$backgroundPress'
                }
                boc={selectedVersion?.name === version.name ? '$borderColorFocus' : 'transparent'}
                onPress={() => setSelectedVersion(version)}
                marginRight={'$2'}>
                <Text>{version.name}</Text>
              </Button>
            ))}
          </ScrollView>
        )}
        {/* END Versions List */}

        {/* Carousel Section */}
        {hasImages ? (
          <View
            // Use calculated container width and height
            width={carouselPropSliderWidth} // The container view is the slider width
            height={Math.max(finalCarouselHeight)} // The container view is the final calculated height
            marginBottom={16}
            alignSelf="center" // Center the carousel container within the screen width
            position="relative">
            {/* Reanimated Carousel */}
            <Carousel
              ref={carouselRef}
              width={itemSlotWidth} // Carousel component width
              height={finalCarouselHeight}
              onConfigurePanGesture={(panGesture) =>
                panGesture.activeOffsetY([-999999, 999999]).activeOffsetX([-20, 20])
              }
              data={originalImages} // Use the original image data
              loop={true} // Keep looping enabled
              snapEnabled={true} // Enable snapping
              onScrollStart={() => setIsCarouselDragging(true)} // Use BeginDrag for setting true
              onScrollEnd={() => setIsCarouselDragging(false)} // Reset drag state reliably
              vertical={false}
              style={{
                width: carouselContainerWidth,
              }}
              onSnapToItem={onSnapToItem} // This updates currentIndex and currentOriginalIndex
              renderItem={({ item, index, animationValue }) => (
                // Wrap the item content in Animated.View to apply animations
                <Animated.View
                  style={[
                    {
                      width: itemSlotWidth, // Item wrapper takes the full slot width
                      height: finalCarouselHeight, // Apply height to Animated.View wrapper
                      justifyContent: 'center',
                      alignItems: 'center',
                      // Add internal padding here to create space *around* the image within the slot
                      padding: itemInternalPadding, // Apply padding based on calculation
                    },
                    animationStyle(animationValue),
                  ]} // Apply the animation style function
                >
                  <TouchableOpacity
                    // Pass the item (URL) to handleImagePress
                    onPress={() => handleImagePress(item)}
                    // Style for the TouchableOpacity to fill the padded Animated.View
                    style={{ flex: 1, width: '100%', height: '100%' }}>
                    <Image
                      source={{ uri: item }}
                      style={{
                        borderRadius: 8,
                        // Image fills the space available within the padded item wrapper (TouchableOpacity)
                        flex: 1, // Allow image to take available space after padding
                        width: '100%',
                        objectPosition: 'center',
                      }}
                      // Add accessibility props - Using state variable as per original code
                      accessibilityLabel={`Model image ${currentOriginalIndex + 1}`}
                      accessibilityRole="image"
                    />
                  </TouchableOpacity>
                </Animated.View>
              )}
            />

            {/* Navigation Buttons - Show only if there are images > 1 */}
            {showNavButtons && (
              <>
                <NavButton
                  onPress={goToPrevious}
                  left={8}
                  icon={<ChevronLeft size={'$2'} fontWeight={'bold'} color={theme.color.get()} />}
                />
                {/* Text indicator for current image */}
                <View
                  position="absolute"
                  bottom="$2" // Adjust position as needed
                  left="50%"
                  transform="translateX(-50%)" // Center horizontally
                  zIndex={10}
                  backgroundColor="$backgroundHover"
                  borderRadius="$3"
                  paddingHorizontal="$2"
                  paddingVertical="$1">
                  <Text fontSize="$1" color="$color" fontWeight="bold">
                    {originalImages.length > 0 ? currentOriginalIndex + 1 : 0} /
                    {originalImages.length}
                  </Text>
                </View>
                <NavButton
                  onPress={goToNext}
                  right={8}
                  icon={<ChevronRight size={'$2'} color={theme.color.get()} />}
                />
              </>
            )}
          </View>
        ) : (
          <View
            // Still use calculated height for consistency in the "no images" placeholder
            height={finalCarouselHeight}
            justifyContent="center"
            alignItems="center"
            marginBottom={16}>
            <Text>No images available for this version.</Text>
          </View>
        )}

        {/* Rest of the details */}
        <View paddingHorizontal={'$2'} marginTop={16}>
          {/* ... Creator, Stats, License, Tags views ... */}
          <Accordion overflow="hidden" width="$20" type="multiple"></Accordion>
          <YStack borderWidth={1} boc={'$borderColor'} br={'$2'}>
            <Text p={'$2'}>Details</Text>
            <XStack borderTopWidth={1} boc={'$borderColor'}>
              <Text p={'$2'}>Type</Text>
            </XStack>
          </YStack>
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
                source={{ uri: modelToDisplay.creator?.image }}
                width={30}
                height={30}
                borderRadius={15}
                marginRight={8}
                accessibilityLabel={`${modelToDisplay.creator?.username}'s avatar`}
                accessibilityRole="image"
              />
              <Text fontSize={16}>{modelToDisplay.creator?.username}</Text>
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
            <Text>Downloads: {shortenNumber(modelToDisplay.stats.downloadCount)}</Text>
            <Text>Favorites: {shortenNumber(modelToDisplay.stats.favoriteCount)}</Text>
            <Text>Thumbs Up: {shortenNumber(modelToDisplay.stats.thumbsUpCount)}</Text>
            <Text>Thumbs Down: {shortenNumber(modelToDisplay.stats.thumbsDownCount)}</Text>
            <Text>Comments: {shortenNumber(modelToDisplay.stats.commentCount)}</Text>
            <Text>Ratings: {shortenNumber(modelToDisplay.stats.ratingCount)}</Text>
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
            <Text>
              Commercial Use:
              {modelToDisplay.allowCommercialUse?.join(', ') || 'No restrictions listed'}
            </Text>
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
            <Text>{modelToDisplay.tags?.join(', ') || 'No tags available'}</Text>
          </View>

          {/* Use selectedVersion directly for description, files, etc. */}
          {selectedVersion && (
            <>
              <Text fontSize={18} fontWeight="bold" my={16}>
                Version: {selectedVersion.name}
              </Text>
              <View
                padding={10}
                borderColor={theme.borderColor.get()}
                borderWidth={1}
                borderRadius={5}
                marginBottom={16}>
                <Text fontSize={16} fontWeight="bold" marginBottom={8}>
                  Version Details
                </Text>
                <Text>Base Model: {selectedVersion.baseModel}</Text>
                <Text>
                  Published At: {new Date(selectedVersion.publishedAt).toLocaleDateString()}
                </Text>
                <Text>Availability: {selectedVersion.availability}</Text>
                <Text>NSFW Level: {selectedVersion.nsfwLevel}</Text>
                {selectedVersion.description && (
                  <>
                    <Text fontWeight="bold" marginTop={8} marginBottom={4}>
                      Version Description
                    </Text>
                    <RenderHTML
                      contentWidth={contentWidthForHtml} // Use the dedicated variable
                      source={{ html: selectedVersion.description }}
                      tagsStyles={htmlStyles}
                    />
                  </>
                )}
              </View>

              {selectedVersion.files && selectedVersion.files.length > 0 ? (
                <View marginTop={8}>
                  <Text fontWeight="bold" marginBottom={4}>
                    Files for this Version
                  </Text>
                  {selectedVersion.files.map((file: FileVersion) => {
                    const downloadedFile = downloadedModel?.modelVersions
                      ?.find((v) => v.id === selectedVersion.id)
                      ?.files?.find((f) => f.id === file.id);

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

                        {/* Pass the model and relevant version/file info */}
                        <XStack gap={'$2'}>
                          <ModelDownloadButton
                            civitaiModel={modelToDisplay}
                            downloadedModel={downloadedModel ?? null}
                            fileId={file.id}
                            versionId={selectedVersion.id}
                            defaultDownload={false}
                          />
                          <ModelDownloadButton
                            civitaiModel={modelToDisplay}
                            downloadedModel={downloadedModel ?? null}
                            fileId={file.id}
                            versionId={selectedVersion.id}
                            defaultDownload
                          />
                        </XStack>

                        {/* Pass the model and relevant version/file info */}
                        {/* Check if the *specific file* is downloaded before showing delete */}
                        {downloadedFile ? <ModelDeleteButton model={downloadedModel!} /> : null}

                        {file.primary && (
                          <Text color="green" fontWeight="bold">
                            Primary
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text>No files available for this version.</Text>
              )}
            </>
          )}
          {modelToDisplay.description && (
            <>
              <Text fontSize={18} fontWeight="bold" my={16}>
                About This Model
              </Text>
              <RenderHTML
                contentWidth={contentWidthForHtml} // Use the dedicated variable
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
          {
            // Use originalImages state for the modal viewer
            // selectedImage now holds the correct original index
            selectedImage !== null && originalImages.length > 0 ? (
              <ImageViewer
                // Pass only the original images to the viewer
                imageUrls={originalImages.map((url) => ({ url }))} // Use state
                enableSwipeDown={true}
                onSwipeDown={() => setModalVisible(false)}
                renderHeader={() => (
                  <Button
                    aspectRatio={1}
                    size={'$3'}
                    style={{
                      position: 'absolute',
                      top: Platform.OS === 'android' ? 30 : 8,
                      right: 8,
                      padding: 8,
                      borderRadius: 15,
                      zIndex: 2,
                    }}
                    icon={<X size={'$3'} />}
                    onPress={() => setModalVisible(false)}></Button>
                )}
                // Pass the original index directly
                index={selectedImage} // Use selectedImage directly
                enableImageZoom={true}
              />
            ) : null // Render nothing if modal is not visible, selectedImage is null, or no images
          }
        </Modal>
      </ScrollView>
    </GestureHandlerRootView>
  );
};

export default ModelDetailScreen;
