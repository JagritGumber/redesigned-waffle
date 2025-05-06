// src/components/ImagePickerModal.tsx

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Modal, Image, Dimensions, Pressable, useWindowDimensions } from 'react-native';
import {
  Button,
  Text,
  YStack,
  XStack,
  useTheme,
  Spinner,
  Paragraph,
  Input,
  Separator,
} from 'tamagui';
import { X, Search, CheckCircle } from '@tamagui/lucide-icons';
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { MasonryFlashList } from '@shopify/flash-list';

import { fetchR2ImagesPage, R2ListPage } from '~/api/templates';
import { router } from 'expo-router';
import { SelectGeneratorJob } from '~/backend/schema';

// Import the Zustand store
import useImageSelectionStore from '~/store/useImageSelectionStore'; // Adjust path if needed

const IMAGE_API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ImagePickerModalProps {
  visible: boolean;
  onClose: () => void;
  // onSelectImages will now receive the final keys array
  onSelectImages: (imageKeys: string[]) => void;
  // initialSelectedImageKeys prop is removed - editor initializes store directly
}

const ImagePickerModal = ({
  visible,
  onClose,
  onSelectImages,
  // initialSelectedImageKeys is removed
}: ImagePickerModalProps) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');

  // Use Zustand for tracking selected images
  const selectedImageKeys = useImageSelectionStore((state) => state.selectedImageKeys);
  const toggleImageSelection = useImageSelectionStore((state) => state.toggleImageSelection);
  // We still need clearSelectionStore here to reset state on modal close
  const clearSelectionStore = useImageSelectionStore((state) => state.clearSelection);

  // --- REMOVE THE INITIALIZATION EFFECT ---
  // The editor will now initialize the store state *before* showing the modal.
  // useEffect(() => {
  //   if (visible) {
  //     setSelectedImageKeysStore(initialSelectedImageKeys);
  //   }
  // }, [visible, initialSelectedImageKeys, setSelectedImageKeysStore]);

  const estimatedItemSize = useMemo(() => {
    const paddingHorizontal = 12;
    const availableWidth = width - paddingHorizontal * 2;
    if (width >= 900) return availableWidth / 5;
    if (width >= 600) return availableWidth / 4;
    return availableWidth / 3;
  }, [width]);

  const queryKey = useMemo(
    () => ['r2ImagesPicker', { query: appliedSearchQuery }] as const,
    [appliedSearchQuery]
  );

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery<
    R2ListPage,
    Error,
    InfiniteData<R2ListPage, string | undefined>,
    typeof queryKey,
    string | undefined
  >({
    queryKey: queryKey,
    queryFn: ({ pageParam, queryKey: [_key, params] }) => {
      return fetchR2ImagesPage({
        pageParam: pageParam,
        params: { ...params, limit: 30 },
      });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextContinuationToken,
    gcTime: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const allImages = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  // Use the Zustand store action
  const handleSelectImage = useCallback(
    (imageKey: string) => {
      toggleImageSelection(imageKey);
    },
    [toggleImageSelection]
  );

  // Handle "Done" button press
  const handleDone = useCallback(() => {
    // 1. Pass the final selection from the store to the parent
    onSelectImages(Array.from(selectedImageKeys));
    // 2. Clear the selection state in the store
    clearSelectionStore();
    // 3. Close the modal
    onClose();
  }, [onSelectImages, onClose, selectedImageKeys, clearSelectionStore]);

  // Handle Modal Close (e.g., via X button or system back)
  // This will also act as a "Cancel" that clears the selection in the store
  const handleClose = useCallback(() => {
    // Clear the selection state in the store if the modal is closed without hitting "Done"
    // This ensures a clean state for the next time the modal is opened.
    // If "Done" was hit, handleDone already cleared it, so calling clearSelectionStore again is harmless.
    clearSelectionStore();
    onClose();
  }, [onClose, clearSelectionStore]);

  const handleSearchPress = useCallback(() => {
    setAppliedSearchQuery(searchQuery);
  }, [searchQuery]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      console.log('Modal: Fetching next page...');
      fetchNextPage();
    } else if (!hasNextPage) {
      console.log('Modal: No more pages to fetch.');
    } else if (isFetchingNextPage) {
      console.log('Modal: Already fetching next page.');
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // renderImageItem reads state from Zustand
  const renderImageItem = useCallback(
    ({ item }: { item: SelectGeneratorJob }) => {
      const imageUrl = `${IMAGE_API_BASE}/api/v1/images/${encodeURIComponent(item.imageKey!)}`;
      // Read selected state from the Zustand store
      const isSelected = selectedImageKeys.has(item.imageKey!);

      return (
        <Pressable
          onPress={() => handleSelectImage(item.imageKey!)}
          onLongPress={() => {
            -onClose(); // REMOVE this line
            router.navigate(`/gallery/${item.id}`);
          }}
          style={{
            padding: 2,
          }}>
          <YStack flex={1} aspectRatio={1} br="$2" overflow="hidden" position="relative">
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            {/* Overlay correctly reflects the Zustand state */}
            {isSelected && (
              <YStack
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                bg="rgba(0, 122, 255, 0.4)"
                jc="center"
                ai="center">
                <Text>
                  <CheckCircle size="$4" color={theme.color.get()} />
                </Text>
              </YStack>
            )}
          </YStack>
        </Pressable>
      );
    },
    [selectedImageKeys, handleSelectImage, theme, router] // Add router to dependencies
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <YStack py="$3" ai="center">
        <Spinner size="small" color={theme.color.get()} />
        <Paragraph size="$2" mt="$1">
          Loading more...
        </Paragraph>
      </YStack>
    );
  }, [isFetchingNextPage, theme]);

  return (
    <Modal
      visible={visible}
      // Use the custom handleClose for both system back and X button
      onRequestClose={handleClose}
      animationType="slide"
      transparent={false}>
      <YStack f={1} p="$3" bg={theme.background.get()} space="$3">
        <XStack jc="space-between" ai="center">
          <Text fontSize="$5" fontWeight="bold">
            Select Images ({selectedImageKeys.size})
          </Text>
          {/* Use custom handleClose for X button */}
          <Button onPress={handleClose} icon={X} size="$3" circular chromeless />
        </XStack>

        <XStack space="$2" ai="center">
          <Input
            flex={1}
            placeholder="Search images..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchPress}
            size="$3"
          />
          <Button
            icon={<Search size="$1" />}
            size="$3"
            circular
            chromeless
            onPress={handleSearchPress}
            disabled={isFetching}
          />
          {appliedSearchQuery !== '' && (
            <Button
              size="$3"
              circular
              chromeless
              onPress={() => {
                setSearchQuery('');
                setAppliedSearchQuery('');
              }}>
              <Button.Text>Clear</Button.Text>
            </Button>
          )}
        </XStack>

        <Separator />

        {isLoading ? (
          <YStack flex={1} jc="center" ai="center">
            <Spinner size="large" color={theme.color9.get()} />
            <Paragraph mt="$2" color={theme.color11.get()}>
              Loading images...
            </Paragraph>
          </YStack>
        ) : isError && !allImages.length ? (
          <YStack flex={1} jc="center" ai="center">
            <Paragraph color={theme.red10.get()}>Error loading images:</Paragraph>
            <Paragraph color={theme.red10.get()} fow="bold">
              {(error as Error)?.message || 'Unknown error'}
            </Paragraph>
            <Button onPress={() => refetch()} mt="$3">
              <Button.Text>Retry</Button.Text>
            </Button>
          </YStack>
        ) : allImages.length === 0 && !isFetching ? (
          <YStack flex={1} jc="center" ai="center">
            <Paragraph>No images found matching your criteria.</Paragraph>
            {appliedSearchQuery !== '' && (
              <Button
                onPress={() => {
                  setSearchQuery('');
                  setAppliedSearchQuery('');
                }}
                mt="$3">
                <Button.Text>Show All Images</Button.Text>
              </Button>
            )}
          </YStack>
        ) : (
          <MasonryFlashList
            data={allImages}
            keyExtractor={(item) => item.id}
            renderItem={renderImageItem}
            estimatedItemSize={estimatedItemSize}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            showsVerticalScrollIndicator={false}
            numColumns={Math.round(width / estimatedItemSize)}
          />
        )}

        {/* Done button reads selected count from Zustand store */}
        <Button onPress={handleDone} theme="accent" disabled={isFetching}>
          <Button.Text>Done ({selectedImageKeys.size} selected)</Button.Text>
        </Button>
        {isError && allImages.length > 0 && (
          <Paragraph textAlign="center" color={theme.red10.get()} size="$2">
            Error fetching more images: {(error as Error)?.message || 'Unknown error'}
          </Paragraph>
        )}
      </YStack>
    </Modal>
  );
};

export default ImagePickerModal;
