import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dimensions, Modal } from 'react-native';
import {
  Button,
  Text,
  YStack,
  XStack,
  Input,
  useTheme,
  Spinner,
  Paragraph,
  Separator,
} from 'tamagui';
import { ArrowLeft, X, RefreshCw } from '@tamagui/lucide-icons'; // Import RefreshCw icon
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ImageList from '../image/ImageList';
import { SelectGeneratorJob } from '~/backend/schema';

interface R2ListParams {
  query?: string;
  prefix?: string;
  limit?: number;
}

interface R2ListPage {
  items: SelectGeneratorJob[];
  nextContinuationToken: string | null;
}

interface BackendListPage {
  status: string;
  message: string;
  items: SelectGeneratorJob[];
  nextPageUrl: string | null;
}
const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const fetchR2ImagesPage = async ({
  pageParam,
  params,
}: {
  pageParam?: string | undefined;
  params: R2ListParams;
}): Promise<R2ListPage> => {
  if (!API_BASE_URL) {
    console.error('EXPO_PUBLIC_BACKEND_URL is not set.');
    throw new Error('Backend URL not configured.');
  }

  let fetchUrl: string;
  const defaultLimit = params.limit || 50;

  if (pageParam) {
    fetchUrl = pageParam;
  } else {
    const url = new URL(`${API_BASE_URL}/api/v1/generator/images`);

    url.searchParams.set('limit', defaultLimit.toString());
    if (params.query) {
      // Add search query parameter if present
      url.searchParams.set('query', params.query);
    }
    if (params.prefix) {
      // Add prefix parameter if present
      url.searchParams.set('prefix', params.prefix);
    }

    fetchUrl = url.toString();
  }

  try {
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to fetch images: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }

    const backendData: BackendListPage = await response.json();

    if (backendData.status === 'error') {
      throw new Error(`Backend reported error: ${backendData.message}`);
    }

    // Note: The backendListPage structure uses 'nextPageUrl',
    // which matches what `useInfiniteQuery` expects for `pageParam`.
    // R2ListPage's `nextContinuationToken` is just a rename for clarity
    // within this component, but the value comes directly from `nextPageUrl`.
    return {
      items: backendData.items,
      nextContinuationToken: backendData.nextPageUrl, // This is the URL for the next page
    };
  } catch (error) {
    console.error('Error fetching images:', error);
    throw error;
  }
};

const ImageGallery = () => {
  const router = useRouter();
  const theme = useTheme();

  const [isFilterVisible, setIsFilterVisible] = useState<boolean>(false);
  const [modalFilterPrefix, setModalFilterPrefix] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [appliedFilters, setAppliedFilters] = useState<R2ListParams>({
    query: '',
    prefix: '',
    limit: 50,
  });

  const [numColumns, setNumColumns] = useState<number>(2);

  // queryKey now depends on appliedFilters
  const queryKey = useMemo(() => ['r2Images', appliedFilters] as const, [appliedFilters]);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching, // This is true when *any* fetch is happening (initial, next page, or refetch)
    isFetchingNextPage, // This is true only when fetchNextPage is running
    isLoading, // This is true only on the initial fetch
    isError,
    refetch, // Destructure the refetch function
  } = useInfiniteQuery<
    R2ListPage,
    Error,
    InfiniteData<R2ListPage, string | undefined>,
    typeof queryKey,
    string | undefined
  >({
    queryKey: queryKey,
    // Pass the current filters from the queryKey to the fetcher
    queryFn: ({ pageParam, queryKey: [_key, currentFilters] }) => {
      return fetchR2ImagesPage({
        pageParam: pageParam, // This will be the nextContinuationToken from the previous page
        params: currentFilters, // These are the filters from the queryKey
      });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.nextContinuationToken;
    },
    // Set staleTime to a low value or 0 if you always want refetch to hit the network
    // By default, data is immediately stale after mount if not configured otherwise,
    // so refetch() will likely fetch from the network anyway.
    // staleTime: 0,
  });

  // Reset scroll/state when filters change to ensure user sees the beginning of the new results
  useEffect(() => {
    if (!isLoading && !isError) {
      // Optional: Add logic here to scroll to top if needed,
      // depending on how ImageList handles its scroll view.
      // Refetching with new filters automatically clears previous data via TanStack Query.
    }
  }, [appliedFilters, isLoading, isError]);

  const allImages = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const updateColumns = useCallback(() => {
    const width = Dimensions.get('window').width;
    if (width >= 900) setNumColumns(4);
    else if (width >= 600) setNumColumns(3);
    else setNumColumns(2);
  }, []);

  useEffect(() => {
    updateColumns();
    const subscription = Dimensions.addEventListener('change', updateColumns);
    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [updateColumns]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    // Applying search filter immediately triggers a refetch via the queryKey dependency
    setAppliedFilters((prev) => ({ ...prev, query }));
  }, []);

  const openFilterModal = () => {
    setModalFilterPrefix(appliedFilters.prefix || ''); // Initialize modal prefix with current applied prefix
    setIsFilterVisible(true);
  };

  const closeFilterModal = () => setIsFilterVisible(false);

  const applyFilters = useCallback(() => {
    // Applying prefix filter immediately triggers a refetch via the queryKey dependency
    setAppliedFilters((prev) => ({
      ...prev,
      prefix: modalFilterPrefix,
    }));
    closeFilterModal();
  }, [modalFilterPrefix]); // Depend on modalFilterPrefix

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      console.log('Fetching next page...');
      fetchNextPage();
    } else if (!hasNextPage) {
      console.log('No more pages to fetch.');
    } else if (isFetchingNextPage) {
      console.log('Already fetching next page.');
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Use isFetching to show a spinner on the refresh button,
  // isLoading for the initial full-screen spinner.
  const showInitialLoading = isLoading; // Only show full spinner on initial load
  const showData = !showInitialLoading && !isError && allImages.length > 0;

  return (
    <YStack flex={1} backgroundColor={theme.background.get()}>
      <XStack
        padding="$3"
        gap={'$3'}
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor={theme.borderColor.get()}>
        <YStack flex={1}>
          <Input
            flex={1}
            placeholder="Search images..."
            value={searchQuery}
            onChangeText={setSearchQuery} // Update searchQuery state directly
            size="$3"
            // No need for onSubmitEditing or similar, update happens via useEffect or direct state change
            // setAppliedFilters handles the refetch logic
          />
        </YStack>

        {/* Refresh Button */}
        <Button
          onPress={() => {
            console.log('Manual refetch triggered');
            refetch(); // Call the refetch function
          }}
          size="$3"
          circular
          chromeless
          disabled={isFetching} // Disable the button while any fetching is active
          // Use isFetching to show spinner or icon
          icon={isFetching ? <Spinner size="small" color={theme.color.get()} /> : <RefreshCw />}
        />

        <Button onPress={openFilterModal} size="$3" theme="accent" variant="outlined">
          Filter
        </Button>
      </XStack>

      {/* Only show initial loading spinner */}
      {showInitialLoading && (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Spinner size="large" color={theme.color9.get()} />
          <Paragraph mt="$2" color={theme.color11.get()}>
            Loading Images...
          </Paragraph>
        </YStack>
      )}

      {/* Show error state if initial loading fails or refetch fails when no data is present */}
      {isError && allImages.length === 0 && (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Paragraph color={theme.red10.get()}>Error loading images:</Paragraph>
          <Paragraph color={theme.red10.get()} fow="bold">
            {(error as Error)?.message || 'Unknown error'}
          </Paragraph>
          <Button onPress={() => refetch()} mt="$4">
            Retry
          </Button>
        </YStack>
      )}

      {/* Show empty state if fetching is complete and no images were found */}
      {!isFetching && !isError && allImages.length === 0 && (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Paragraph>No images found matching your criteria.</Paragraph>
          <Button onPress={() => refetch()} mt="$4">
            {/* Allow retry from empty state */}
            Refresh
          </Button>
        </YStack>
      )}

      {/* Render the list only when data is available */}
      {showData && (
        <ImageList
          images={[...allImages]}
          // Pass isFetchingNextPage separately to ImageList if it needs to know specifically about loading more
          isLoadingInitial={false} // Initial loading handled by the full screen spinner
          numColumns={numColumns}
          hasNextPage={hasNextPage}
          isError={isError} // ImageList might want to show inline error for "load more"
          isLoadingMore={isFetchingNextPage} // Pass loading more state
          loadMore={loadMore}
        />
      )}

      <Modal
        visible={isFilterVisible}
        onRequestClose={closeFilterModal}
        animationType="slide"
        transparent={false}>
        <YStack f={1} p="$4" bg={theme.background.get()} space="$3">
          <XStack jc="space-between" ai="center">
            <Text fontSize="$6" fontWeight="bold">
              Filter Options
            </Text>

            <Button onPress={closeFilterModal} icon={X} size="$3" circular chromeless />
          </XStack>

          <YStack space="$2">
            <Input
              placeholder="Filter by Prefix" // Updated placeholder
              value={modalFilterPrefix}
              onChangeText={setModalFilterPrefix}
            />

            {/* <Input
              placeholder="Limit per page"
              value={appliedFilters.limit.toString()}
              onChangeText={(text) => setModalFilterLimit(parseInt(text, 10) || 50)}
              keyboardType="numeric"
            /> */}
          </YStack>

          <Separator marginVertical="$2" />

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

export default ImageGallery;
