import React from 'react';
import { Dimensions, Platform } from 'react-native'; // Import Platform
import { Text, Spinner, Button, View } from 'tamagui'; // Removed ScrollView as FlashList is scrollable
import ModelCard from './ModelCard';
import { Model } from '~/types/civitai';
// Import MasonryFlashList (no need for /experimental suffix in newer versions usually)
import { MasonryFlashList } from '@shopify/flash-list';

// Define constants for spacing
const itemGap = 16;

interface ModelListProps {
  models: Model[];
  numColumns: number;
  isLoadingMore?: boolean;
  hasNextPage?: boolean;
  loadMore?: () => void;
  isLoadingInitial: boolean;
  isError: boolean;
}

const ModelList: React.FC<ModelListProps> = ({
  numColumns,
  models,
  loadMore,
  isLoadingInitial,
  isLoadingMore,
  isError,
  hasNextPage,
}) => {
  // --- Handle Initial Loading, Error, and Empty States ---
  // These checks happen BEFORE rendering the list itself, regardless of platform.

  if (isLoadingInitial) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Text mb="$4">Loading Civit AI Models...</Text>
        <Spinner size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Text color="$red10" textAlign="center">
          Error loading Civit AI Models.
        </Text>
      </View>
    );
  }

  // Handle empty state *after* initial load and no error
  if (models.length === 0 && !isLoadingInitial && !isError) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Text color="$gray10" textAlign="center">
          No Civit AI models found based on your criteria.
        </Text>
      </View>
    );
  }

  // --- Common Render Item Function ---
  // This function renders a single item. Spacing will be handled differently
  // depending on the list type wrapper.
  const renderModelItem = ({ item }: { item: Model }) => {
    return <ModelCard model={item} />;
  };

  // --- Common Footer Component Logic ---
  // The rendering differs slightly based on the list type.
  const renderFooter = () => {
    if (isLoadingMore) {
      // Spinner for loading more
      return (
        <View width="100%" alignItems="center" py={itemGap}>
          {/* Ensure it spans width */}
          <Spinner size="small" />
        </View>
      );
    }
    // Button for loading more
    if (hasNextPage && loadMore) {
      return (
        <View width="100%" alignItems="center" py={itemGap}>
          {/* Ensure it spans width */}
          <Button onPress={loadMore}>Load More</Button>
        </View>
      );
    }
    // End of results message
    if (!hasNextPage && models.length > 0) {
      return (
        <View width="100%" alignItems="center" py={itemGap}>
          {/* Ensure it spans width */}
          <Text color="$gray10" textAlign="center">
            End of results
          </Text>
        </View>
      );
    }
    return null; // Don't render anything if no more items or loading
  };

  // --- Platform-Specific Rendering ---
  if (Platform.OS === 'web') {
    return (
      <View
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="flex-start"
        bg={'$background'}
        overflowY="scroll"
        flex={1}
        m={itemGap / 2}>
        {models.map((model, index) => (
          <View key={model.id} width={`calc(100% / ${numColumns})`} padding={itemGap / 2}>
            {renderModelItem({ item: model })}
          </View>
        ))}
        {/* Render Footer Component after all items */}
        {renderFooter()}
      </View>
    );
  } else {
    const nativeItemWrapperPadding = itemGap / 2;
    const nativeContentPadding = itemGap / 2;

    return (
      <MasonryFlashList
        data={models}
        // Wrap renderItem output to apply padding for spacing
        renderItem={({ item }) => (
          <View padding={nativeItemWrapperPadding}>{renderModelItem({ item })}</View>
        )}
        numColumns={numColumns}
        estimatedItemSize={400} // Adjust if cards vary wildly in height
        // Apply padding to the content container to create space around the list
        contentContainerStyle={{
          padding: nativeContentPadding,
        }}
        // Infinite scrolling props
        onEndReached={() => hasNextPage && !isLoadingMore && loadMore?.()}
        onEndReachedThreshold={0.7} // Trigger when 70% of the list height is left
        // Footer component for load more indicator/button/message
        ListFooterComponent={renderFooter}
        // Optional: ListEmptyComponent if you want an empty message *within* the list area
        // This is redundant with the check before the return statement if models.length is 0 initially.
        // It might be useful if filters are applied and result in an empty list *after* initial load.
        ListEmptyComponent={
          !isLoadingInitial && !isError && models.length === 0 ? (
            <View flex={1} justifyContent="center" alignItems="center" pt={itemGap}>
              <Text color="$gray10" textAlign="center">
                No Civit AI models found.
              </Text>
            </View>
          ) : null
        }
        keyExtractor={(item) => item.id.toString()}
        // Ensure FlashList takes up available space and is scrollable
      />
    );
  }
};

export default ModelList;
