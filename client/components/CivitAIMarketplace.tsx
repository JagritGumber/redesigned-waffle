// components/CivitAIMarketplace.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dimensions, Modal, ActivityIndicator } from 'react-native';
import {
  Button,
  Select,
  Checkbox,
  Text,
  YStack,
  XStack,
  ScrollView,
  Input,
  useTheme,
  Spinner,
  Paragraph,
  Separator, // Use Tamagui Separator
  View,
  useDebounceValue, // Keep for Modal if needed
} from 'tamagui';
import { Check, ChevronDown, ArrowLeft } from '@tamagui/lucide-icons';
import { useInfiniteQuery } from '@tanstack/react-query'; // Import useInfiniteQuery
import { useRouter } from 'expo-router';

import { modelTypes, sortOptions } from '~/constants/marketplace';
import {
  fetchCivitAIModelsPage, // Use the page-fetching function
  buildInitialUrl, // Helper to build the first URL
  FetchModelsParams, // Import the params type
} from '~/utils/fetchCivitAiModels';
import SearchBar from './SearchBar';
import ModelList from './ModelList'; // Assuming ModelList accepts a flat array of models

const CivitAIMarketplace = () => {
  const router = useRouter();

  // == State for UI Controls ==
  const [isFilterVisible, setIsFilterVisible] = useState<boolean>(false);
  const [modalFilterTag, setModalFilterTag] = useState<string>('');
  const [modalFilterUsername, setModalFilterUsername] = useState<string>('');
  const [modalFilterTypes, setModalFilterTypes] = useState<string[]>([]);
  const [modalFilterSort, setModalFilterSort] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<FetchModelsParams>({
    query: '',
    tag: '',
    username: '',
    types: [],
    sort: '',
    // Add base params like nsfw if they can be controlled or are constant
    nsfw: false,
    limit: 20, // Match the limit used in buildInitialUrl
  });

  const [numColumns, setNumColumns] = useState<number>(2);
  const [debouncedSearchQuery] = useDebounceValue(searchQuery, 500);

  // == TanStack Infinite Query Hook ==
  const queryKey = useMemo(() => ['models', appliedFilters], [appliedFilters]);

  const {
    data, // Structure is { pages: [FetchModelsPage, ...], pageParams: [...] }
    error,
    fetchNextPage, // Function to fetch the next page
    hasNextPage, // Boolean indicating if there's a next page URL
    isFetching, // Is fetching *any* page (initial or next)
    isFetchingNextPage, // Is fetching specifically the *next* page
    isLoading, // Is loading the *initial* page
    isError, // Is in error state
    refetch, // Function to refetch all pages from scratch
  } = useInfiniteQuery({
    queryKey: queryKey,
    // queryFn receives an object, we only need pageParam from it
    queryFn: ({ pageParam }) => fetchCivitAIModelsPage({ pageParam }),
    // `initialPageParam` is the URL for the very first page fetch
    initialPageParam: buildInitialUrl(appliedFilters),
    // `getNextPageParam` extracts the URL for the *next* page from the *last* successfully fetched page
    getNextPageParam: (lastPage /* this is of type FetchModelsPage */) => {
      // Return the nextPageUrl from the last fetched page's data,
      // or undefined/null if there isn't one, signaling the end.
      return lastPage.nextPageUrl;
    },
    // staleTime: 5 * 60 * 1000, // Optional: Cache data longer
    // gcTime: 10 * 60 * 1000, // Optional: Keep data longer even if unused
  });

  // Flatten the pages array into a single list of models for rendering
  const allModels = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  // == Responsive Columns == (Keep your existing logic)
  const updateColumns = useCallback(() => {
    const width = Dimensions.get('window').width;
    if (width >= 900) setNumColumns(4);
    else if (width >= 600) setNumColumns(3);
    else setNumColumns(2);
  }, []);

  useEffect(() => {
    updateColumns();
    const subscription = Dimensions.addEventListener('change', updateColumns);
    return () => subscription?.remove();
  }, [updateColumns]);

  // == Event Handlers ==
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Update applied filters when debounced search query changes
  useEffect(() => {
    // Reset to first page when search query changes
    setAppliedFilters((prev) => ({ ...prev, query: debouncedSearchQuery }));
  }, [debouncedSearchQuery]);

  const openFilterModal = () => {
    setModalFilterTag(appliedFilters.tag || '');
    setModalFilterUsername(appliedFilters.username || '');
    setModalFilterTypes(appliedFilters.types || []);
    setModalFilterSort(appliedFilters.sort || '');
    setIsFilterVisible(true);
  };

  const closeFilterModal = () => setIsFilterVisible(false);

  const applyFilters = useCallback(() => {
    // Update the *applied* filters state. This changes the queryKey,
    // causing useInfiniteQuery to refetch from the *initial* page.
    setAppliedFilters((prev) => ({
      ...prev, // Keep existing query and base params
      tag: modalFilterTag,
      username: modalFilterUsername,
      types: modalFilterTypes,
      sort: modalFilterSort,
    }));
    closeFilterModal();
  }, [modalFilterTag, modalFilterUsername, modalFilterTypes, modalFilterSort]);

  const toggleModalFilterType = (type: string) => {
    setModalFilterTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const goBack = () => {
    router.replace('/(tabs)/two'); // Fallback
  };

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  // == Render Logic ==
  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Header */}
      <XStack
        padding="$3"
        gap={'$3'}
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor="$borderColor">
        <Button icon={ArrowLeft} onPress={goBack} size="$3" chromeless circular />
        <YStack flex={1}>
          <SearchBar onSearch={handleSearch} initialQuery={searchQuery} />
        </YStack>
        {/* Optional: Add filter button directly in header */}
        <Button onPress={openFilterModal} size="$3" theme="accent" variant="outlined">
          Filter
        </Button>
      </XStack>

      {/* Filter Button & Status (alternative placement) */}
      {/* <XStack px="$4" py="$2" space>
        <Button onPress={openFilterModal} flex={1}>Filter</Button>
        {(isLoading || isFetching) && <Spinner size="small" />}
      </XStack> */}

      {/* Use ScrollView for the main content area */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 50 }} // Add padding for load more button
        // You could potentially add onEndReached={loadMore} for infinite scroll
      >
        {/* Loading State (Initial Load) */}
        {isLoading && (
          <YStack flex={1} jc="center" ai="center" p="$4">
            <Spinner size="large" color="$blue10" />
            <Paragraph mt="$2" col="$color11">
              Loading Models...
            </Paragraph>
          </YStack>
        )}

        {/* Error State */}
        {isError &&
          !isLoading && ( // Don't show error during initial load spinner
            <YStack flex={1} jc="center" ai="center" p="$4">
              <Paragraph col="$red10">Error loading models:</Paragraph>
              <Paragraph col="$red10" fow="bold">
                {(error as Error)?.message || 'Unknown error'}
              </Paragraph>
              <Button onPress={() => refetch()} mt="$4">
                Retry
              </Button>
            </YStack>
          )}

        {/* Success State - No results */}
        {!isLoading && !isError && allModels.length === 0 && (
          <YStack flex={1} jc="center" ai="center" p="$4">
            <Paragraph>No models found matching your criteria.</Paragraph>
          </YStack>
        )}

        {/* Success State - Show List */}
        {!isLoading && !isError && allModels.length > 0 && (
          <ModelList
            models={allModels}
            numColumns={numColumns}
            isLoadingMore={isFetchingNextPage}
            isLoadingInitial={isLoading}
            isError={isError}
            hasNextPage={hasNextPage}
            loadMore={loadMore}
          />
        )}

        {/* Load More Button / Indicator */}
        <YStack p="$4" ai="center">
          {isFetchingNextPage ? (
            <Spinner />
          ) : hasNextPage ? (
            <Button onPress={loadMore} disabled={!hasNextPage || isFetchingNextPage}>
              Load More
            </Button>
          ) : (
            // Only show "End of results" if we are not loading and have some models already
            !isLoading &&
            allModels.length > 0 && <Paragraph theme="accent">End of results</Paragraph>
          )}
        </YStack>
      </ScrollView>

      {/* Filter Modal (Keep your existing modal structure) */}
      <Modal visible={isFilterVisible} onRequestClose={closeFilterModal} animationType="slide">
        {/* Use YStack for layout inside modal */}
        <YStack f={1} p="$4" bg="$background" space="$3">
          {/* Modal Title */}
          <XStack jc="space-between" ai="center">
            <Text fontSize="$6" fontWeight="bold">
              Filter Options
            </Text>
            {/* Optional: Close button inside modal */}
            {/* <Button onPress={closeFilterModal} icon={X} circular chromeless /> */}
          </XStack>

          {/* Inputs */}
          <YStack space="$2">
            <Input placeholder="Tag" value={modalFilterTag} onChangeText={setModalFilterTag} />
            <Input
              placeholder="Username"
              value={modalFilterUsername}
              onChangeText={setModalFilterUsername}
            />
          </YStack>

          <Separator marginVertical="$2" />

          {/* Types Checkboxes */}
          <Text fontWeight="bold" mb="$2">
            Types:
          </Text>
          <YStack space="$2">
            {modelTypes.map((type) => (
              <XStack key={type} ai="center" space="$2">
                <Checkbox
                  id={`modal-type-${type}`}
                  checked={modalFilterTypes.includes(type)}
                  onCheckedChange={() => toggleModalFilterType(type)}
                  size="$3">
                  <Checkbox.Indicator>
                    <Check size={16} />
                  </Checkbox.Indicator>
                </Checkbox>
                <Text htmlFor={`modal-type-${type}`}>{type}</Text>
              </XStack>
            ))}
          </YStack>

          <Separator marginVertical="$2" />

          {/* Sort Select */}
          <Text fontWeight="bold" mb="$2">
            Sort By:
          </Text>
          <Select
            value={modalFilterSort}
            onValueChange={setModalFilterSort}
            disablePreventBodyScroll>
            <Select.Trigger iconAfter={ChevronDown}>
              <Select.Value placeholder="Select Sort..." />
            </Select.Trigger>
            <Select.Content zIndex={200000}>
              <Select.ScrollUpButton />
              <Select.Viewport minWidth={200}>
                <Select.Group>
                  <Select.Label>Sort Options</Select.Label>
                  <Select.Item index={-1} value="">
                    <Select.ItemText>None</Select.ItemText>
                    <Select.ItemIndicator marginLeft="auto">
                      <Check size={16} />
                    </Select.ItemIndicator>
                  </Select.Item>
                  {sortOptions.map((option, i) => (
                    <Select.Item index={i} key={option} value={option}>
                      <Select.ItemText>{option}</Select.ItemText>
                      <Select.ItemIndicator marginLeft="auto">
                        <Check size={16} />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.Viewport>
              <Select.ScrollDownButton />
            </Select.Content>
          </Select>

          <Separator marginVertical="$3" />

          {/* Modal Action Buttons */}
          <XStack jc="space-between" space="$3">
            <Button onPress={closeFilterModal} theme="accent" variant="outlined" f={1}>
              Cancel
            </Button>
            <Button onPress={applyFilters} theme="accent" f={1}>
              Apply Filters
            </Button>
          </XStack>
        </YStack>
      </Modal>
    </YStack>
  );
};

export default CivitAIMarketplace;
