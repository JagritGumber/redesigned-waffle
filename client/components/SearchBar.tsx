import React, { useState, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Input, View } from 'tamagui';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchText, setSearchText] = useState<string>('');

  const handleSearchSubmit = useCallback(() => {
    onSearch(searchText);
  }, [onSearch, searchText]);

  return (
    <View flexDirection="row" alignItems="center" marginBottom={16}>
      <Input
        flex={1}
        h={40}
        borderColor="$color.gray700" // Using a theme color for border
        borderWidth={1}
        borderRadius={8}
        px={10}
        mr={8}
        placeholder="Search Models..."
        value={searchText}
        onChangeText={setSearchText}
        onSubmitEditing={handleSearchSubmit}
      />
      <Button h={40} mr={16} onPress={handleSearchSubmit}>
        Search
      </Button>
    </View>
  );
};

export default SearchBar;
