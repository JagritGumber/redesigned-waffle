import { useState, useEffect, useCallback } from 'react';
import { ScrollView, StyleSheet, Dimensions, Modal, TextInput } from 'react-native';
import { View, Button, Select, Checkbox, Text } from 'tamagui';
import { Check, ChevronDown } from '@tamagui/lucide-icons';
import { modelTypes, sortOptions } from '~/constants/marketplace'; // Assuming you have these in a separate file
import SearchBar from './SearchBar';
import ModelList from './ModelList';
import { useMarketplaceStore } from '~/store/useMarketplaceStore'; // Import the local store

const { width: screenWidth } = Dimensions.get('window');
const cardMarginBase = 16;

const CivitAIMarketplace = () => {
  const [isFilterVisible, setIsFilterVisible] = useState<boolean>(false);
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterUsername, setFilterUsername] = useState<string>('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterSort, setFilterSort] = useState<string>('');
  const [numColumns, setNumColumns] = useState<number>(2);

  const { fetchModels, setModels, setHasSearchedOrFiltered } = useMarketplaceStore();

  useEffect(() => {
    const updateColumns = () => {
      const width = Dimensions.get('window').width;
      if (width >= 900) {
        setNumColumns(4);
      } else if (width >= 600) {
        setNumColumns(3);
      } else {
        setNumColumns(2);
      }
    };

    Dimensions.addEventListener('change', updateColumns);
    updateColumns();
  }, []);

  useEffect(() => {
    setModels([]); // Clear models on initial load or refresh
    fetchModels();
  }, [fetchModels, setModels]);

  const handleSearch = useCallback(
    async (query: string) => {
      setModels([]); // Clear existing models on new search
      setHasSearchedOrFiltered(true);
      await fetchModels(1, query, {
        tag: filterTag,
        username: filterUsername,
        types: filterTypes,
        sort: filterSort,
      });
    },
    [
      fetchModels,
      filterTag,
      filterUsername,
      filterTypes,
      filterSort,
      setModels,
      setHasSearchedOrFiltered,
    ]
  );

  const openFilterModal = () => {
    setIsFilterVisible(true);
  };

  const closeFilterModal = () => {
    setIsFilterVisible(false);
  };

  const applyFilters = useCallback(async () => {
    setModels([]);
    setHasSearchedOrFiltered(true);
    await fetchModels(1, '', {
      tag: filterTag,
      username: filterUsername,
      types: filterTypes,
      sort: filterSort,
    });
    closeFilterModal();
  }, [
    fetchModels,
    filterTag,
    filterUsername,
    filterTypes,
    filterSort,
    setModels,
    setHasSearchedOrFiltered,
  ]);

  const toggleFilterType = (type: string) => {
    if (filterTypes.includes(type)) {
      setFilterTypes(filterTypes.filter((t) => t !== type));
    } else {
      setFilterTypes([...filterTypes, type]);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollViewContent}>
      <SearchBar onSearch={handleSearch} />

      <View style={styles.filterContainer}>
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

      <ModelList numColumns={numColumns} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollViewContent: {
    paddingBottom: cardMarginBase,
    paddingLeft: 16,
    paddingTop: 16,
  },
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterButton: {
    height: 40,
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
