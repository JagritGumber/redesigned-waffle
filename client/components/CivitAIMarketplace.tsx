import { useState, useEffect, useCallback } from 'react';
import { Dimensions, Modal } from 'react-native';
import { View, Button, Select, Checkbox, Text, YStack, XStack, Spacer, ScrollView, Input, TextArea } from 'tamagui';
import { Check, ChevronDown } from '@tamagui/lucide-icons';
import { modelTypes, sortOptions } from '~/constants/marketplace'; // Assuming you have these in a separate file
import SearchBar from './SearchBar';
import ModelList from './ModelList';
import { useMarketplaceStore } from '~/store/useMarketplaceStore'; // Import the local store
import { useTheme } from 'tamagui';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const cardMarginBase = 16;

const CivitAIMarketplace = () => {
  const theme = useTheme();
  const [isFilterVisible, setIsFilterVisible] = useState<boolean>(false);
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterUsername, setFilterUsername] = useState<string>('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterSort, setFilterSort] = useState<string>('');
  const [numColumns, setNumColumns] = useState<number>(2);

  const { fetchModels, setModels, setHasSearchedOrFiltered } = useMarketplaceStore();

  const updateColumns = useCallback(() => {
    const width = Dimensions.get('window').width;
    if (width >= 900) {
      setNumColumns(4);
    } else if (width >= 600) {
      setNumColumns(3);
    } else {
      setNumColumns(2);
    }
  }, [setNumColumns]);

  useEffect(() => {
    Dimensions.addEventListener('change', updateColumns);
    updateColumns();
    return () => {
      // Dimensions.removeEventListener('change', updateColumns); // Removed as per user feedback
    };
  }, [updateColumns]);

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
    <ScrollView contentContainerStyle={{
      paddingBottom: cardMarginBase,
      paddingLeft: 16,
      paddingTop: 16,
      backgroundColor: theme.background.get(),
      height: screenHeight - 60
    }}>
      <SearchBar onSearch={handleSearch} />

      <View mb={16} pr={16} bg={"$background"} > {/* filterContainer */}
        <Button h={40} onPress={openFilterModal}> {/* filterButton */}
          Filter
        </Button>
      </View>

      <Modal visible={isFilterVisible} onRequestClose={closeFilterModal} animationType="slide" >
        <View flex={1} p={16} bg={theme.background.get()}> {/* modalContainer */}
          <Text fs={20} fontWeight="bold" mb={16}>
            Filter Options
          </Text>

          <Input
            h={40}
            borderColor="$color.gray700"
            borderWidth={1}
            borderRadius={8}
            px="$2" // Using Tamagui's padding token
            mb={12}
            placeholder="Tag"
            value={filterTag}
            onChangeText={setFilterTag}
          />

          <Input
            h={40}
            borderColor="$color.gray700"
            borderWidth={1}
            borderRadius={8}
            px="$2" // Using Tamagui's padding token
            mb={12}
            placeholder="Username"
            value={filterUsername}
            onChangeText={setFilterUsername}
          />

          <Text fontWeight="bold" mt={16} mb={8}>
            Types:
          </Text>
          <View>
            {modelTypes.map((type) => (
              <XStack key={type} alignItems="center" mb={8}> {/* checkboxContainer */}
                <Checkbox
                  value={type}
                  checked={filterTypes.includes(type)}
                  onCheckedChange={() => toggleFilterType(type)}>
                  <Checkbox.Indicator>
                    <Check size={16} />
                  </Checkbox.Indicator>
                </Checkbox>
                <Text ml={8}>{type}</Text> {/* checkboxLabel */}
              </XStack>
            ))}
          </View>

          <Text fontWeight="bold" mt={16} mb={8}>
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

          <XStack jc="space-around" mt={24}> {/* modalButtons */}
            <Button onPress={applyFilters}>Apply Filters</Button>
            <Button onPress={closeFilterModal} bg="$color.gray400">
              Cancel
            </Button>
          </XStack>
        </View>
      </Modal>

      <ModelList numColumns={numColumns} />
    </ScrollView>
  );
};

export default CivitAIMarketplace;
