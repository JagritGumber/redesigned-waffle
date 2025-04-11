import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  ScrollView,
  StyleSheet,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Text, View, Button, Select, Checkbox } from 'tamagui';
import { Check, ChevronDown } from '@tamagui/lucide-icons';
import { Model } from '~/types/civitai';
import ModelCard from './ModelCard'; // Import the new component

const { width: screenWidth } = Dimensions.get('window');
const cardMargin = 16;
const cardGap = 16;
const desiredAspectRatio = 4 / 6; // Width / Height

const modelTypes = [
  'Checkpoint',
  'TextualInversion',
  'Hypernetwork',
  'AestheticGradient',
  'LORA',
  'Controlnet',
  'Poses',
];
const sortOptions = [
  'Highest Rated',
  'Most Downloaded',
  'Most Liked',
  'Most Discussed',
  'Most Collected',
  'Most Images',
  'Newest',
  'Oldest',
];

const CivitAIMarketplace = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [isFilterVisible, setIsFilterVisible] = useState<boolean>(false);
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterUsername, setFilterUsername] = useState<string>('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterSort, setFilterSort] = useState<string>('');
  const [hasSearchedOrFiltered, setHasSearchedOrFiltered] = useState<boolean>(false); // New state

  const fetchCivitAIModels = useCallback(
    async (
      pageNumber: number = 1,
      query: string = '',
      filters: { tag?: string; username?: string; types?: string[]; sort?: string } = {}
    ) => {
      setError(null);
      try {
        setLoading(pageNumber === 1 && !query && Object.keys(filters).length === 0);
        let url = `https://civitai.com/api/v1/models?page=${pageNumber}&query=${query}&token=${process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN}&nsfw=${true}`;
        if (filters.tag) {
          url += `&tag=${filters.tag}`;
        }
        if (filters.username) {
          url += `&username=${filters.username}`;
        }
        if (filters.types && filters.types.length > 0) {
          url += `&types=${filters.types.join(',')}`;
        }
        if (filters.sort) {
          url += `&sort=${filters.sort}`; // Use the exact value from the filterSort state
        }
        const response = await axios.get(url);
        const newModels = response.data.items || [];
        setModels((prevModels) => (pageNumber === 1 ? newModels : [...prevModels, ...newModels]));
        setNextPageUrl(response.data.metadata?.nextPage || null);
        setHasMore(response.data.metadata?.nextPage !== null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setLoading(true); // Set loading for initial mount
    fetchCivitAIModels(); // Load initial page on component mount
  }, [fetchCivitAIModels]);

  const handleSearchSubmit = useCallback(async () => {
    setModels([]); // Clear existing models on new search
    setNextPageUrl(null);
    setLoading(true); // Set loading to true when search starts
    setHasSearchedOrFiltered(true); // Set to true on search
    await fetchCivitAIModels(1, searchText, {
      tag: filterTag,
      username: filterUsername,
      types: filterTypes,
      sort: filterSort,
    });
  }, [searchText, fetchCivitAIModels, filterTag, filterUsername, filterTypes, filterSort]);

  const loadMoreModels = useCallback(async () => {
    if (nextPageUrl && !isFetchingMore) {
      setIsFetchingMore(true);
      setError(null);
      try {
        const response = await axios.get(nextPageUrl);
        const newModels = response.data.items || [];
        setModels((prevModels) => [...prevModels, ...newModels]);
        setNextPageUrl(response.data.metadata?.nextPage || null);
        setHasMore(response.data.metadata?.nextPage !== null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsFetchingMore(false);
      }
    }
  }, [nextPageUrl, isFetchingMore]);

  const openFilterModal = () => {
    setIsFilterVisible(true);
  };

  const closeFilterModal = () => {
    setIsFilterVisible(false);
  };

  const applyFilters = useCallback(async () => {
    setModels([]);
    setNextPageUrl(null);
    setSearchQuery('');
    setLoading(true); // Set loading for filter apply
    setHasSearchedOrFiltered(true); // Set to true on filter apply
    await fetchCivitAIModels(1, '', {
      tag: filterTag,
      username: filterUsername,
      types: filterTypes,
      sort: filterSort,
    });
    closeFilterModal();
  }, [fetchCivitAIModels, filterTag, filterUsername, filterTypes, filterSort]);

  const toggleFilterType = (type: string) => {
    if (filterTypes.includes(type)) {
      setFilterTypes(filterTypes.filter((t) => t !== type));
    } else {
      setFilterTypes([...filterTypes, type]);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollViewContent}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search Models..."
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={handleSearchSubmit}
        />
        <Button style={styles.searchButton} onPress={handleSearchSubmit}>
          Search
        </Button>
        <Button style={styles.filterButton} onPress={openFilterModal}>
          Filter
        </Button>
      </View>

      <Modal visible={isFilterVisible} onRequestClose={closeFilterModal} animationType="slide">
        <View style={styles.modalContainer}>
          <Text fontSize={20} fontWeight="bold" marginBottom={16}>
            Filter Options
          </Text>

          <TextInput
            style={styles.filterInput}
            placeholder="Tag"
            value={filterTag}
            onChangeText={setFilterTag}
          />

          <TextInput
            style={styles.filterInput}
            placeholder="Username"
            value={filterUsername}
            onChangeText={setFilterUsername}
          />

          <Text fontWeight="bold" marginTop={16} marginBottom={8}>
            Types:
          </Text>
          <View>
            {modelTypes.map((type) => (
              <View key={type} style={styles.checkboxContainer}>
                <Checkbox
                  value={type}
                  checked={filterTypes.includes(type)}
                  onCheckedChange={() => toggleFilterType(type)}>
                  <Checkbox.Indicator>
                    <Check size={16} />
                  </Checkbox.Indicator>
                </Checkbox>
                <Text style={styles.checkboxLabel}>{type}</Text>
              </View>
            ))}
          </View>

          <Text fontWeight="bold" marginTop={16} marginBottom={8}>
            Sort By:
          </Text>
          <Select value={filterSort} onValueChange={setFilterSort}>
            <Select.Trigger width={220} iconAfter={ChevronDown}>
              <Select.Value placeholder="None" />
            </Select.Trigger>
            <Select.Content zIndex={200000}>
              <Select.Viewport>
                <Select.Group>
                  {sortOptions.map((option, index) => (
                    <Select.Item key={option} index={index} value={option}>
                      {' '}
                      {/* Use the exact backend expected value */}
                      <Select.ItemText>{option}</Select.ItemText>
                      {filterSort === option && (
                        <Select.ItemIndicator marginLeft="auto">
                          <Check size={16} />
                        </Select.ItemIndicator>
                      )}
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.Viewport>
            </Select.Content>
          </Select>

          <View style={styles.modalButtons}>
            <Button onPress={applyFilters}>Apply Filters</Button>
            <Button onPress={closeFilterModal} backgroundColor="$color.gray400">
              Cancel
            </Button>
          </View>
        </View>
      </Modal>

      <View style={styles.marketplaceContainer}>
        {loading ? (
          <Text>Loading Civit AI Models...</Text>
        ) : error ? (
          <Text>Error loading Civit AI Models: {error}</Text>
        ) : (
          <>
            {models.map((model) => (
              <ModelCard key={model.id} model={model} />
            ))}
            {models.length === 0 && !loading && hasSearchedOrFiltered && (
              <Text color="$color.gray300">No Civit AI models found based on your criteria.</Text>
            )}
            {models.length === 0 && !loading && !error && !hasSearchedOrFiltered && (
              <Text color="$color.gray300">No Civit AI models found.</Text>
            )}
            {isFetchingMore && <ActivityIndicator style={styles.loadMoreIndicator} />}
            {hasMore && !isFetchingMore && (
              <Button style={styles.loadMoreButton} onPress={loadMoreModels}>
                Load More
              </Button>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollViewContent: {
    padding: cardMargin,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: cardMargin,
  },
  searchBar: {
    flex: 1,
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  searchButton: {
    height: 40,
    marginRight: 8,
  },
  filterButton: {
    height: 40,
  },
  marketplaceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: cardMargin,
    gap: cardGap,
  },
  modelCard: {
    width: '48%',
    aspectRatio: desiredAspectRatio,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  modelImage: {
    width: '100%',
    height: '100%',
  },
  cardTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
  },
  cardTitle: {
    color: 'white',
  },
  cardSubtitle: {
    color: 'white',
  },
  loadMoreButton: {
    marginTop: 16,
    alignSelf: 'center',
  },
  loadMoreIndicator: {
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '$color.white',
  },
  filterInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 24,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkboxLabel: {
    marginLeft: 8,
  },
});

export default CivitAIMarketplace;
