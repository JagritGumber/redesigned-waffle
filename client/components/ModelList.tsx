import React from 'react';
import { Dimensions } from 'react-native';
import { Text, Spinner, Button, View } from 'tamagui';
import ModelCard from './ModelCard';
import { useMarketplaceStore } from '~/store/useMarketplaceStore'; // Adjust path if needed

const { width: screenWidth } = Dimensions.get('window');
const cardMarginBase = 16;
const cardGapBase = 16;

interface ModelListProps {
  numColumns: number;
}

const ModelList: React.FC<ModelListProps> = ({ numColumns }) => {
  const { models, loading, error, hasMore, isFetchingMore, loadMore, hasSearchedOrFiltered } =
    useMarketplaceStore();
  const cardWidth = `calc(${100 / numColumns}% - ${cardGapBase}px)`;
  const marginRight = cardGapBase;
  const marginBottom = cardGapBase;

  if (loading) {
    return <Text>Loading Civit AI Models...</Text>;
  }

  if (error) {
    return <Text>Error loading Civit AI Models: {error}</Text>;
  }

  if (models.length === 0 && !loading && hasSearchedOrFiltered) {
    return <Text color="$color.gray300">No Civit AI models found based on your criteria.</Text>;
  }

  if (models.length === 0 && !loading && !error && !hasSearchedOrFiltered) {
    return <Text color="$color.gray300">No Civit AI models found.</Text>;
  }

  return (
    <View
      flexDirection="row"
      flexWrap="wrap"
      justifyContent="flex-start"
      bg={"$background"}
    >
      {models.map((model, index) => (
        <View
          key={model.id}
          width={cardWidth}
          marginBottom={marginBottom}
          marginRight={(index + 1) % numColumns !== 0 ? marginRight : undefined}
        >
          <ModelCard model={model} />
        </View>
      ))}
      {isFetchingMore && <Spinner mt={16} />}
      {hasMore && !isFetchingMore && (
        <Button mt={16} alignSelf="center" onPress={loadMore}>
          Load More
        </Button>
      )}
    </View>
  );
};

export default ModelList;
