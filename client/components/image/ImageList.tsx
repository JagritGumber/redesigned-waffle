// components/ImageList.tsx
import React from 'react';
import { Dimensions, Platform } from 'react-native';
import { Text, Spinner, Button, View, Paragraph } from 'tamagui';
import ImageCard from './ImageCard';
import { SelectGeneratorJob } from '~/backend/schema';
import { MasonryFlashList } from '@shopify/flash-list';

const itemGap = 12;
const itemWrapperPadding = itemGap / 2;
const contentContainerPadding = itemGap / 2;

interface ImageListProps {
  images: SelectGeneratorJob[];
  numColumns: number;
  isLoadingInitial: boolean;
  isLoadingMore?: boolean;
  hasNextPage?: boolean;
  loadMore?: () => void;
  isError?: boolean;
}

const ImageList: React.FC<ImageListProps> = ({
  numColumns,
  images,
  loadMore,
  isLoadingInitial,
  isLoadingMore,
  isError,
  hasNextPage,
}) => {
  const renderImageItem = ({ item }: { item: SelectGeneratorJob }) => {
    return (
      <View padding={itemWrapperPadding}>
        <ImageCard image={item} />
      </View>
    );
  };

  const renderFooter = () => {
    if (images.length === 0 && (!isLoadingMore || !hasNextPage)) {
      return null;
    }
    if (isLoadingMore) {
      return (
        <View width="100%" alignItems="center" py={itemGap}>
          <Spinner size="small" />
          <Paragraph mt="$2" color="$gray10">
            Loading more...
          </Paragraph>
        </View>
      );
    }
    if (hasNextPage && loadMore) {
      return null; // FlashList onEndReached handles loading more
    }
    if (!hasNextPage && images.length > 0) {
      return (
        <View width="100%" alignItems="center" py={itemGap}>
          <Paragraph color="$gray10" textAlign="center">
            End of results
          </Paragraph>
        </View>
      );
    }
    return null;
  };

  if (isLoadingInitial) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Text mb="$4">Loading images...</Text>
        <Spinner size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Text color="$red10" textAlign="center">
          Error loading images.
        </Text>
      </View>
    );
  }

  if (images.length === 0 && !isLoadingInitial && !isError) {
    return (
      <View flex={1} justifyContent="center" alignItems="center">
        <Text color="$gray10" textAlign="center">
          No images found based on your criteria.
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="flex-start"
        bg={'$background'}
        overflowY="auto"
        flex={1}
        p={contentContainerPadding}>
        {images.map((image) => (
          <View key={image.imageKey} width={`${100 / numColumns}%`}>
            {renderImageItem({ item: image })}
          </View>
        ))}
        {renderFooter()}
      </View>
    );
  } else {
    return (
      <MasonryFlashList
        data={images}
        renderItem={renderImageItem}
        numColumns={numColumns}
        estimatedItemSize={200} // Adjusted estimate slightly
        contentContainerStyle={{
          padding: contentContainerPadding,
        }}
        onEndReached={() => {
          if (hasNextPage && !isLoadingMore) {
            console.log('MasonryFlashList onEndReached: Triggering loadMore');
            loadMore?.();
          } else if (!hasNextPage) {
            console.log('MasonryFlashList onEndReached: No more pages.');
          } else if (isLoadingMore) {
            console.log('MasonryFlashList onEndReached: Already loading.');
          }
        }}
        onEndReachedThreshold={0.8}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          !isLoadingInitial && !isError && images.length === 0 && !isLoadingMore ? (
            <View flex={1} justifyContent="center" alignItems="center" p={itemGap}>
              <Paragraph color="$gray10" textAlign="center">
                No images found matching your criteria.
              </Paragraph>
            </View>
          ) : null
        }
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
      />
    );
  }
};

export default ImageList;
