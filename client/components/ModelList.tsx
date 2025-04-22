import React from 'react';
import { Dimensions } from 'react-native';
import { Text, Spinner, Button, View } from 'tamagui';
import ModelCard from './ModelCard';
import { useMarketplaceStore } from '~/store/useMarketplaceStore'; // Adjust path if needed
import { Model } from '~/types/civitai';

const { width: screenWidth } = Dimensions.get('window');
const cardMarginBase = 16;
const cardGapBase = 16;

interface ModelListProps {
  models: Model[];
  numColumns: number;
  isLoadingMore?: boolean; // Optional: To display loading within individual cards
  hasNextPage?: boolean; // Do we have a next page
  loadMore?: () => void; // Action for loading more
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
  useMarketplaceStore();
  const cardWidth = `calc(${100 / numColumns}% - ${cardGapBase}px)`;
  const marginRight = cardGapBase;
  const marginBottom = cardGapBase;

  if (isLoadingInitial) {
    return <Text>Loading Civit AI Models...</Text>;
  }

  if (isError) {
    return <Text>Error loading Civit AI Models</Text>;
  }

  if (models.length === 0 && !isLoadingInitial) {
    return <Text color="$color.gray300">No Civit AI models found based on your criteria.</Text>;
  }

  if (models.length === 0 && !isLoadingInitial && !isError) {
    return <Text color="$color.gray300">No Civit AI models found.</Text>;
  }

  return (
    <View
      flexDirection="row"
      flexWrap="wrap"
      justifyContent="flex-start"
      bg={'$background'}
      pl={'$4'}>
      {models.map((model, index) => (
        <View
          key={model.id}
          width={cardWidth}
          marginBottom={marginBottom}
          marginRight={(index + 1) % numColumns !== 0 ? marginRight : undefined}>
          <ModelCard model={model} />
        </View>
      ))}
      {isLoadingMore && <Spinner mt={16} />}
      {hasNextPage && !isLoadingMore && (
        <Button mt={16} alignSelf="center" onPress={loadMore}>
          Load More
        </Button>
      )}
    </View>
  );
};

export default ModelList;
