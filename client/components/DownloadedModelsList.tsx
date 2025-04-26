import React from 'react';
import { Platform } from 'react-native';
import { Text, Spinner, View, YStack } from 'tamagui';

import { CivitaiModelWithRelations } from '~/backend/schema/models';
import DownloadedModelCard from './DownloadedModelCard';

import { MasonryFlashList } from '@shopify/flash-list';

const itemGap = 16;

interface DownloadedModelsListProps {
  models: CivitaiModelWithRelations[];
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  numColumns?: number;
}

const DownloadedModelsList: React.FC<DownloadedModelsListProps> = ({
  models,
  isLoading,
  isError,
  error,
  numColumns = 2,
}) => {
  if (isLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner size="large" color="$blue10" />
        <Text mt="$2" color="$color11">
          Loading downloaded models...
        </Text>
      </YStack>
    );
  }

  if (isError) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$red10">Error fetching downloaded models:</Text>
        <Text color="$red10" fontSize="$2" textAlign="center">
          {error?.message || 'Unknown error'}
        </Text>
      </YStack>
    );
  }

  if (models.length === 0 && !isLoading && !isError) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Text color="$gray10">No models downloaded yet.</Text>
      </YStack>
    );
  }

  const renderDownloadedModelItem = ({ item }: { item: CivitaiModelWithRelations }) => {
    return <DownloadedModelCard model={item} />;
  };

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
        {models.map((model) => (
          <View key={model.id} width={`calc(100% / ${numColumns})`} padding={itemGap / 2}>
            {renderDownloadedModelItem({ item: model })}
          </View>
        ))}
        {/* No footer component needed */}
      </View>
    );
  } else {
    const nativeItemWrapperPadding = itemGap / 2;
    const nativeContentPadding = itemGap / 2;

    return (
      <MasonryFlashList
        data={models}
        renderItem={({ item }) => (
          <View padding={nativeItemWrapperPadding}>{renderDownloadedModelItem({ item })}</View>
        )}
        numColumns={numColumns}
        estimatedItemSize={400}
        contentContainerStyle={{
          padding: nativeContentPadding,
        }}
        ListEmptyComponent={
          !isLoading && !isError && models.length === 0 ? (
            <View flex={1} justifyContent="center" alignItems="center" pt={itemGap}>
              <Text color="$gray10" textAlign="center">
                No models found.
              </Text>{' '}
              {/* Updated message for downloaded */}
            </View>
          ) : null
        }
        keyExtractor={(item) => item.id.toString()}
        style={{ flex: 1 }}
      />
    );
  }
};

export default DownloadedModelsList;
