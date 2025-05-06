import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Button,
  Text,
  YStack,
  XStack,
  Input,
  useTheme,
  TextArea,
  Paragraph,
  Separator,
  ScrollView,
  RadioGroup,
  Label,
  Spinner,
  Image,
} from 'tamagui';
import {
  ArrowLeft,
  Plus,
  Minus,
  Save,
  Image as ImageIcon,
  Trash2,
  X,
  Search,
  CheckCircle,
  ChevronUp,
} from '@tamagui/lucide-icons';
import { useRouter, useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import {
  fetchTemplateById,
  createTemplate,
  updateTemplate,
  postToPlatform,
  fetchR2ImagesPage,
  R2ListPage,
} from '~/api/templates';

import useImageSelectionStore from '~/store/useImageSelectionStore';
import usePostEditorStore from '~/store/usePostEditorStore'; // Import the store

import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { SelectGeneratorJob } from '~/backend/schema';
import { Pressable, useWindowDimensions } from 'react-native';
import { MasonryFlashList } from '@shopify/flash-list';

const IMAGE_API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

const ImageItem = ({ item }: { item: SelectGeneratorJob }) => {
  const selectedImageKeys = useImageSelectionStore((state) => state.selectedImageKeys);
  const toggleImageSelection = useImageSelectionStore((state) => state.toggleImageSelection);

  const { width } = useWindowDimensions();

  const estimatedItemSize = useMemo(() => {
    const paddingHorizontal = 12 * 2;
    const gap = 6 * 2;
    const availableWidth = width - paddingHorizontal;
    if (width >= 900) return (availableWidth - gap * 4) / 5;
    if (width >= 600) return (availableWidth - gap * 3) / 4;
    return (availableWidth - gap * 2) / 3;
  }, [width]);

  const handleSelectImage = useCallback(
    (imageKey: string) => {
      toggleImageSelection(imageKey);
    },
    [toggleImageSelection]
  );

  if (!item.imageKey) return null;
  const imageUrl = `${IMAGE_API_BASE}/api/v1/images/${encodeURIComponent(item.imageKey)}`;

  const isSelected = selectedImageKeys.includes(item.imageKey!);

  return (
    <Pressable
      onPress={() => handleSelectImage(item.imageKey!)}
      onLongPress={() => {
        router.navigate(`/gallery/${item.id}`);
      }}
      style={{
        padding: 2,
        width: estimatedItemSize,
      }}>
      <YStack flex={1} aspectRatio={1} br="$2" overflow="hidden" position="relative">
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        {isSelected && (
          <YStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="rgba(0, 122, 255, 0.4)"
            jc="center"
            ai="center"
            zIndex={1}>
            <Text color={'white'}>
              <CheckCircle size="$4" color="white" />
            </Text>
          </YStack>
        )}
      </YStack>
    </Pressable>
  );
};

const PostEditor = () => {
  const router = useRouter();
  const theme = useTheme();
  const { id: templateIdParam } = useLocalSearchParams<{ id: string }>();

  // Get state and actions from the store
  const {
    post,
    templateId: storeTemplateId,
    isCreating: storeIsCreating,
    isLoading,
    isSaving,
    isPosting,
    statusMessage,
    error,
    setPost,
    updatePost,
    setTemplateInfo,
    setLoading,
    setSaving,
    setPosting,
    setStatusMessage,
    setError,
    resetState,
  } = usePostEditorStore();

  // Determine current template ID and creation status from params
  const isCreating = templateIdParam === 'create';
  const templateId = isCreating ? null : templateIdParam;

  // Bottom sheet state and logic (Untouched as requested)
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['60%', '100%'], []);
  const [sheetIndex, setSheetIndex] = useState<number>(-1);

  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');

  const selectedImageKeys = useImageSelectionStore((state) => state.selectedImageKeys);
  const setSelectedImageKeysStore = useImageSelectionStore((state) => state.setSelectedImageKeys);
  const clearSelectionStore = useImageSelectionStore((state) => state.clearSelection);

  const queryKey = useMemo(
    () => ['r2ImagesPicker', { query: appliedSearchQuery }] as const,
    [appliedSearchQuery]
  );

  const { width } = useWindowDimensions();

  const estimatedItemSize = useMemo(() => {
    const paddingHorizontal = 12 * 2;
    const gap = 6 * 2;
    const availableWidth = width - paddingHorizontal;

    if (width >= 900) return (availableWidth - gap * 4) / 5;
    if (width >= 600) return (availableWidth - gap * 3) / 4;
    return (availableWidth - gap * 2) / 3;
  }, [width]);

  const {
    data,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetching: isFetchingImages,
    isFetchingNextPage: isFetchingNextImagesPage,
    isLoading: isLoadingImages,
    isError: isImageQueryError,
    refetch: refetchImages,
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

  const handleDoneSelectingImages = useCallback(() => {
    updatePost({
      // Update store's post state
      imageKeys: Array.from(selectedImageKeys),
    });

    clearSelectionStore();

    bottomSheetRef.current?.close();
    setStatusMessage(`${selectedImageKeys.length} image(s) selected.`); // Use store action
  }, [selectedImageKeys, clearSelectionStore, updatePost, setStatusMessage]);

  const handleCloseSheet = useCallback(() => {
    clearSelectionStore();
    setSheetIndex(-1);
  }, [clearSelectionStore, setSheetIndex]);

  const handleSearchPress = useCallback(() => {
    setAppliedSearchQuery(searchQuery);
  }, [searchQuery]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextImagesPage) {
      console.log('Picker Sheet: Fetching next page...');
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextImagesPage, fetchNextPage]);

  const renderSheetFooter = useCallback(() => {
    if (!isFetchingNextImagesPage) return null;
    return (
      <YStack py="$3" ai="center">
        <Spinner size="small" color={theme.color.get()} />
        <Paragraph size="$2" mt="$1">
          Loading more...
        </Paragraph>
      </YStack>
    );
  }, [isFetchingNextImagesPage, theme]);
  // End of Bottom sheet state and logic

  // Effect to load template data when screen focuses
  useFocusEffect(
    useCallback(() => {
      console.log(`Focus Effect: templateIdParam=${templateIdParam}, isCreating=${isCreating}`);
      console.log(
        `Store State: storeTemplateId=${storeTemplateId}, storeIsCreating=${storeIsCreating}, isLoading=${isLoading}`
      );

      // Determine the effective template ID and creation status based on params
      const currentRouteTemplateId = isCreating ? null : templateIdParam;
      const currentRouteIsCreating = isCreating;

      // Check if the store state already matches the current route context AND is not loading
      const isStoreAlreadySyncedAndNotLoading =
        !isLoading &&
        storeTemplateId === currentRouteTemplateId &&
        storeIsCreating === currentRouteIsCreating;

      // Case 1: Store is already in the correct state and not busy. Do nothing.
      if (isStoreAlreadySyncedAndNotLoading) {
        console.log(
          'Focus Effect: Store is already synced and not loading for this route context. Skipping.'
        );
        return;
      }

      // Case 2: We are in create mode on this route, but the store isn't set up for it.
      // This handles initial 'create' load or navigating from edit to create.
      if (currentRouteIsCreating) {
        console.log('Focus Effect: Handling create mode.');
        // Reset store state and set context
        console.log('Resetting state for create mode.');
        resetState(); // Reset post data, loading state, etc.
        setTemplateInfo('create', true); // Explicitly set store context to 'create'
        // Clear related stores that persist data per-editor instance
        bottomSheetRef.current?.close(); // Close image picker if open
        clearSelectionStore(); // Clear any selected images in the picker store
        // In create mode, we don't fetch, so we're done.
        return;
      }

      // Case 3: We are in edit mode on this route, and the store is NOT synced for this ID.
      // This handles initial 'edit' load or navigating from create/different edit to this edit ID.
      if (currentRouteTemplateId) {
        // templateId is the same as currentRouteTemplateId here
        console.log(`Focus Effect: Loading template ${currentRouteTemplateId}...`);
        const loadTemplate = async () => {
          // Set the store context *before* starting the async operation.
          // This indicates *which* template the store is trying to load/represent.
          setTemplateInfo(currentRouteTemplateId, currentRouteIsCreating); // currentRouteIsCreating is false here

          setLoading(true); // Indicate loading started (state change)
          setError(null);
          setStatusMessage(null);
          try {
            const template = await fetchTemplateById(currentRouteTemplateId);
            setPost({
              // Set loaded data (state change)
              type: template.type,
              name: template.title,
              title: template.title,
              description: template.description,
              options: template.type === 'poll' && template.options ? template.options : [],
              imageKeys: template.imageKeys || [],
            });
            setStatusMessage(`Template "${template.name || template.title}" loaded.`);
          } catch (err: any) {
            console.error(`Failed to load template ${currentRouteTemplateId}:`, err);
            setError(`Failed to load template: ${err.message}`);
            setStatusMessage(null);
            // Keep the templateId/isCreating set in the store even on error,
            // so the error state persists for this specific ID context.
          } finally {
            setLoading(false); // Indicate loading finished (state change)
          }
        };
        loadTemplate();
      }

      // Dependencies: Include values from props/route and store state that the
      // *decision logic* at the top of the effect depends on.
      // Include store actions used, as per React hooks best practices (they should be stable).
    }, [
      templateIdParam, // Changes when navigating to a different template or create
      isCreating, // Changes when switching between create/edit mode
      storeTemplateId, // Changes when setTemplateInfo is called
      storeIsCreating, // Changes when setTemplateInfo is called
      isLoading, // Changes when setLoading is called

      // Store Actions (should be stable)
      setTemplateInfo,
      setLoading,
      setError,
      setStatusMessage,
      setPost,
      resetState,
      clearSelectionStore, // Used in the create mode branch

      // fetchTemplateById - it's an imported function, doesn't need to be a dependency
    ])
  );

  const handlePollOptionChange = useCallback(
    (index: number, text: string) => {
      updatePost((prev) => ({
        // Use store action
        options: prev.options.map((option, idx) => (idx === index ? text : option)),
      }));
    },
    [updatePost]
  ); // Dependency on updatePost action

  const handleAddPollOption = useCallback(() => {
    updatePost((prev) => ({
      // Use store action
      options: [...prev.options, ''],
    }));
  }, [updatePost]); // Dependency on updatePost action

  const handleRemovePollOption = useCallback(
    (index: number) => {
      if (post.type === 'poll' && post.options.length <= 2) {
        // Use store state
        setStatusMessage('Polls require at least two options.'); // Use store action
        return;
      }
      updatePost((prev) => ({
        // Use store action
        options: prev.options.filter((_, idx) => idx !== index),
      }));
      setStatusMessage(null); // Use store action
    },
    [post.type, post.options.length, updatePost, setStatusMessage] // Dependencies on store state and actions
  );

  const handleAddImagesPress = useCallback(() => {
    clearSelectionStore();
    setSelectedImageKeysStore(post.imageKeys); // Reads imageKeys from store's post state
    bottomSheetRef.current?.snapToIndex(0); // Opens bottom sheet (Untouched)
    setError(null); // Use store action
    setStatusMessage(null); // Use store action
  }, [post.imageKeys, setSelectedImageKeysStore, clearSelectionStore, setError, setStatusMessage]); // Dependencies on store state and actions

  const handleRemoveImage = useCallback(
    (imageKeyToRemove: string) => {
      updatePost((prev) => ({
        // Use store action
        imageKeys: prev.imageKeys.filter((key) => key !== imageKeyToRemove),
      }));
      setStatusMessage(`Image removed.`); // Use store action
    },
    [updatePost, setStatusMessage]
  ); // Dependencies on store action

  const handleSaveTemplate = useCallback(async () => {
    setSaving(true); // Use store action
    setStatusMessage(null); // Use store action
    setError(null); // Use store action

    const payload = {
      // Reads from store state
      name:
        post.title.trim() ||
        (isCreating ? `Untitled-${new Date().toLocaleString()}` : `Template ${templateId}`),
      type: post.type,
      title: post.title.trim(),
      description: post.description,
      options: post.type === 'poll' ? post.options.filter((v) => v.trim() !== '') : undefined,
      imageKeys: post.imageKeys.filter((key) => key.trim() !== ''),
    };

    if (!payload.name || !payload.title) {
      setError('Name and Title are required.'); // Use store action
      setSaving(false); // Use store action
      return;
    }
    if (payload.type === 'poll' && (!payload.options || payload.options.length < 2)) {
      setError('Polls require at least two options.'); // Use store action
      setSaving(false); // Use store action
      return;
    }

    try {
      if (isCreating) {
        const newTemplate = await createTemplate(payload);
        setStatusMessage('Template saved successfully!'); // Use store action
        console.log('Created template:', newTemplate);
      } else if (templateId) {
        await updateTemplate(templateId, payload);
        setStatusMessage('Template updated successfully!'); // Use store action
        console.log(`Updated template ${templateId}`);
      }
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setError(`Failed to save template: ${err.message}`); // Use store action
      setStatusMessage(null); // Use store action
    } finally {
      setSaving(false); // Use store action
    }
  }, [
    post,
    isCreating,
    templateId,
    setSaving,
    setStatusMessage,
    setError,
    createTemplate,
    updateTemplate,
  ]); // Dependencies on store state, params, actions, and API calls

  const handlePost = useCallback(
    async (platform: 'patreon' | 'deviantart') => {
      setPosting(true); // Use store action
      setStatusMessage(null); // Use store action
      setError(null); // Use store action

      const postData = {
        // Reads from store state
        name: post.title.trim() || `Untitled-${new Date().toLocaleString()}`,
        type: post.type,
        title: post.title.trim(),
        description: post.description,
        options: post.type === 'poll' ? post.options.filter((v) => v.trim() !== '') : undefined,
        imageKeys: post.imageKeys.filter((key) => key.trim() !== ''),
      };

      if (!postData.title) {
        setError('Title is required to post.'); // Use store action
        setPosting(false); // Use store action
        return;
      }
      if (postData.type === 'poll' && (!postData.options || postData.options.length < 2)) {
        setError('Polls require at least two options.'); // Use store action
        setPosting(false); // Use store action
        return;
      }

      try {
        await postToPlatform(platform, postData);
        setStatusMessage(`Post successfully sent to ${platform}!`); // Use store action
      } catch (err: any) {
        console.error(`Error posting to ${platform}:`, err);
        setError(`Failed to post: ${err.message}`); // Use store action
        setStatusMessage(null); // Use store action
      } finally {
        setPosting(false); // Use store action
      }
    },
    [post, setPosting, setStatusMessage, setError, postToPlatform] // Dependencies on store state, actions, and API call
  );

  const goBack = useCallback(() => {
    // Optionally reset store state here if navigating completely away
    // resetState(); // <-- Uncomment if you want to clear state when going back to the list
    router.replace('/(tabs)/five');
  }, [router]); // Dependency on router

  const isFormValid = useMemo(() => {
    // Uses store state
    const titleValid = post.title.trim() !== '';
    const pollOptionsValid =
      post.type === 'text' || post.options.filter((opt) => opt.trim() !== '').length >= 2;
    return titleValid && pollOptionsValid;
  }, [post]); // Dependency on store state

  const isSaveDisabled = // Uses store state
    isSaving ||
    isPosting ||
    isLoading ||
    !post.title.trim() ||
    (post.type === 'poll' && post.options.filter((opt) => opt.trim() !== '').length < 1);

  const isPostDisabled = !isFormValid || isPosting || isSaving || isLoading; // Uses store state

  // Use isLoading from store for initial loading state
  if (isLoading && !isCreating) {
    return (
      <YStack flex={1} jc="center" ai="center" p="$4" backgroundColor={theme.background.get()}>
        <Spinner size="large" color={theme.color9.get()} />
        <Paragraph mt="$2" color={theme.color11.get()}>
          Loading template...
        </Paragraph>
      </YStack>
    );
  }

  // Use error from store
  if (error && isLoading === false && !isCreating) {
    return (
      <YStack flex={1} jc="center" ai="center" p="$4" backgroundColor={theme.background.get()}>
        <Paragraph color={theme.red10.get()}>Error loading template:</Paragraph>
        <Paragraph color={theme.red10.get()} fow="bold">
          {error}
        </Paragraph>
        <Button onPress={goBack} mt="$4">
          Back to Templates
        </Button>
      </YStack>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <YStack flex={1} backgroundColor={theme.background.get()}>
        <XStack
          padding="$3"
          gap={'$3'}
          alignItems="center"
          borderBottomWidth={1}
          borderBottomColor={theme.borderColor.get()}>
          <Button
            icon={ArrowLeft}
            onPress={goBack}
            size="$3"
            chromeless
            circular
            aria-label="Go back to templates list"
          />
          <Text fontSize="$6" fontWeight="bold" flex={1}>
            {isCreating ? 'Create New Template' : `Edit Template`}
            {templateId && <Text fontSize="$3">{` (ID: ${templateId.substring(0, 6)}...)`}</Text>}
          </Text>
        </XStack>

        <ScrollView flex={1}>
          <YStack padding="$4" space="$4">
            <YStack space="$2">
              <Text fontSize="$4" fontWeight="bold">
                Post Type:
              </Text>
              <RadioGroup
                value={post.type} // Use store state
                onValueChange={
                  (value) => updatePost({ type: value as 'text' | 'poll' }) // Use store action
                }
                name="postType"
                aria-label="Select post type"
                disabled={isLoading || isSaving || isPosting}>
                {/* Use store state */}
                <XStack space="$3" accessibilityRole="radiogroup">
                  <YStack space="$2" ai="center">
                    <RadioGroup.Item value="text" id="text" size="$3">
                      <RadioGroup.Indicator />
                    </RadioGroup.Item>
                    <Label size="$3" htmlFor="text">
                      Text Post
                    </Label>
                  </YStack>
                  <YStack space="$2" ai="center">
                    <RadioGroup.Item value="poll" id="poll" size="$3">
                      <RadioGroup.Indicator />
                    </RadioGroup.Item>
                    <Label size="$3" htmlFor="poll">
                      Poll
                    </Label>
                  </YStack>
                </XStack>
              </RadioGroup>
            </YStack>

            <Input
              size="$4"
              placeholder="Post Title (used as Template Name if saving new)"
              value={post.title} // Use store state
              onChangeText={(text) => updatePost({ title: text })} // Use store action
              disabled={isLoading || isSaving || isPosting} // Use store state
            />

            <TextArea
              size="$4"
              placeholder="Post Description (Optional)"
              value={post.description} // Use store state
              onChangeText={(text) => updatePost({ description: text })} // Use store action
              minHeight={120}
              numberOfLines={5}
              disabled={isLoading || isSaving || isPosting} // Use store state
            />

            {post.type === 'poll' && ( // Use store state
              <YStack space="$2">
                <Text fontSize="$4" fontWeight="bold">
                  Poll Options:
                </Text>
                {post.options.map(
                  (
                    option,
                    index // Use store state
                  ) => (
                    <XStack key={index} space="$2" ai="center">
                      <Input
                        flex={1}
                        size="$3"
                        placeholder={`Option ${index + 1}`}
                        value={option} // Use store state
                        onChangeText={(text) => handlePollOptionChange(index, text)}
                        disabled={isLoading || isSaving || isPosting} // Use store state
                      />
                      {post.options.length > 2 && ( // Use store state
                        <Button
                          size="$3"
                          icon={Minus}
                          circular
                          chromeless
                          theme="error"
                          onPress={() => handleRemovePollOption(index)}
                          disabled={isLoading || isSaving || isPosting} // Use store state
                        />
                      )}
                    </XStack>
                  )
                )}
                <Button
                  size="$3"
                  icon={Plus}
                  onPress={handleAddPollOption}
                  variant="outlined"
                  disabled={isLoading || isSaving || isPosting}>
                  {/* Use store state */}
                  Add Option
                </Button>
              </YStack>
            )}

            <YStack space="$2">
              <XStack jc="space-between" ai="center">
                <Text fontSize="$4" fontWeight="bold">
                  Attached Images ({post.imageKeys.length}): {/* Use store state */}
                </Text>
                <Button
                  size="$3"
                  icon={<ImageIcon size="$1" />}
                  onPress={handleAddImagesPress}
                  disabled={isLoading || isSaving || isPosting}>
                  {/* Use store state */}
                  Add/Select Images
                </Button>
              </XStack>

              {post.imageKeys.length > 0 && ( // Use store state
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <XStack space="$2">
                    {post.imageKeys.map(
                      (
                        imageKey // Use store state
                      ) => (
                        <YStack
                          key={imageKey}
                          width={80}
                          height={80}
                          position="relative"
                          br="$2"
                          overflow="hidden">
                          <Image
                            source={{
                              uri: `${IMAGE_API_BASE}/api/v1/images/${encodeURIComponent(imageKey)}`,
                            }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                          <Button
                            position="absolute"
                            top="$1"
                            right="$1"
                            size="$2"
                            circular
                            theme="error"
                            icon={<Trash2 size="$1" />}
                            onPress={() => handleRemoveImage(imageKey)}
                            disabled={isLoading || isSaving || isPosting} // Use store state
                          />
                        </YStack>
                      )
                    )}
                  </XStack>
                </ScrollView>
              )}
            </YStack>

            <Separator marginVertical="$2" />

            <YStack space="$3">
              <Button
                variant="outlined"
                onPress={handleSaveTemplate}
                disabled={isSaveDisabled} // Use store state
                icon={isSaving ? <Spinner size="small" color={theme.color.get()} /> : <Save />}>
                {/* Use store state */}
                {isCreating ? 'Save Template' : 'Update Template'}
              </Button>
              <XStack space="$3">
                <Button
                  flex={1}
                  theme="accent"
                  onPress={() => handlePost('patreon')}
                  disabled={isPostDisabled}>
                  {/* Use store state */}
                  {isPosting ? 'Posting...' : 'Post to Patreon'} {/* Use store state */}
                </Button>
                <Button flex={1} onPress={() => handlePost('deviantart')} disabled={isPostDisabled}>
                  {/* Use store state */}
                  {isPosting ? 'Posting...' : 'Post to DeviantArt'} {/* Use store state */}
                </Button>
              </XStack>
            </YStack>

            {(statusMessage || error) && ( // Use store state
              <Paragraph
                textAlign="center"
                mt="$2"
                color={error ? theme.red10.get() : theme.color.get()}>
                {statusMessage || error} {/* Use store state */}
              </Paragraph>
            )}
          </YStack>
        </ScrollView>

        {/* Start of Bottom Sheet Code (untouched as per instructions) */}
        <BottomSheet
          ref={bottomSheetRef}
          index={sheetIndex}
          snapPoints={snapPoints}
          enablePanDownToClose={true}
          handleIndicatorStyle={{ backgroundColor: theme.borderColor.get() }}
          backgroundStyle={{
            backgroundColor: theme.background.get(),
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
          }}
          onChange={setSheetIndex}
          onClose={handleCloseSheet}>
          <YStack f={1} p="$3" space="$3">
            <XStack jc="space-between" ai="center">
              <Text fontSize="$5" fontWeight="bold">
                Select Images ({selectedImageKeys.length})
              </Text>
              <Button
                onPress={() => bottomSheetRef.current?.close()}
                icon={X}
                size="$3"
                circular
                chromeless
                aria-label="Close image picker"
              />
            </XStack>

            <XStack space="$2" ai="center">
              <Input
                flex={1}
                placeholder="Search images..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchPress}
                size="$3"
                disabled={isFetchingImages}
              />
              <Button
                icon={<Search size="$1" />}
                size="$3"
                circular
                chromeless
                onPress={handleSearchPress}
                disabled={isFetchingImages}
                aria-label="Search images"
              />
              {appliedSearchQuery !== '' && (
                <Button
                  size="$3"
                  circular
                  chromeless
                  onPress={() => {
                    setSearchQuery('');
                    setAppliedSearchQuery('');
                  }}
                  disabled={isFetchingImages}
                  aria-label="Clear search">
                  <Button.Text>Clear</Button.Text>
                </Button>
              )}
            </XStack>

            <Separator />

            {isLoadingImages && !allImages.length ? (
              <YStack flex={1} jc="center" ai="center">
                <Spinner size="large" color={theme.color9.get()} />
                <Paragraph mt="$2" color={theme.color11.get()}>
                  Loading images...
                </Paragraph>
              </YStack>
            ) : isImageQueryError && !allImages.length ? (
              <YStack flex={1} jc="center" ai="center">
                <Paragraph color={theme.red10.get()}>Error loading images:</Paragraph>
                <Paragraph color={theme.red10.get()} fow="bold">
                  {(queryError as Error)?.message || 'Unknown error'}
                </Paragraph>
                <Button onPress={() => refetchImages()} mt="$3">
                  <Button.Text>Retry</Button.Text>
                </Button>
              </YStack>
            ) : allImages.length === 0 && !isFetchingImages ? (
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
              <BottomSheetScrollView style={{ flex: 1 }}>
                <MasonryFlashList
                  data={allImages}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => <ImageItem item={item} />}
                  estimatedItemSize={estimatedItemSize}
                  onEndReached={handleEndReached}
                  onEndReachedThreshold={0.5}
                  ListFooterComponent={renderSheetFooter}
                  showsVerticalScrollIndicator={false}
                  numColumns={Math.max(1, Math.round(width / estimatedItemSize))}
                  contentContainerStyle={{
                    paddingHorizontal: 0,
                    paddingBottom: 20,
                  }}
                  extraData={selectedImageKeys}
                />
              </BottomSheetScrollView>
            )}

            <Button onPress={handleDoneSelectingImages} theme="accent" disabled={isFetchingImages}>
              <Button.Text>Done ({selectedImageKeys.length} selected)</Button.Text>
            </Button>
            {isImageQueryError && allImages.length > 0 && (
              <Paragraph textAlign="center" color={theme.red10.get()} size="$2">
                Error fetching more images: {(queryError as Error)?.message || 'Unknown error'}
              </Paragraph>
            )}
          </YStack>
        </BottomSheet>

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
            aria-label="Open image picker"></Button>
        )}
        {/* End of Bottom Sheet Code */}
      </YStack>
    </GestureHandlerRootView>
  );
};

export default PostEditor;
