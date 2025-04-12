import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Text } from 'tamagui';
import ModelCard from './ModelCard';
import { useMarketplaceStore } from '~/store/useMarketplaceStore'; // Adjust path if needed
import { Spinner, Button, View } from 'tamagui';

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
    <View style={styles.marketplaceContainer}>
      {models.map((model, index) => (
        <View
          key={model.id}
          style={[
            { width: cardWidth, marginBottom: marginBottom },
            (index + 1) % numColumns !== 0 && { marginRight: marginRight },
          ]}>
          <ModelCard model={model} />
        </View>
      ))}
      {isFetchingMore && <Spinner style={styles.loadMoreIndicator} />}
      {hasMore && !isFetchingMore && (
        <Button style={styles.loadMoreButton} onPress={loadMore}>
          Load More
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  marketplaceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: cardMarginBase,
  },
  loadMoreButton: {
    marginTop: 16,
    alignSelf: 'center',
  },
  loadMoreIndicator: {
    marginTop: 16,
  },
});

export default ModelList;
