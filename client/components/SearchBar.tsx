import React, { useState, useCallback } from 'react';
import { Button, Input, View } from 'tamagui';

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, initialQuery }) => {
  const [searchText, setSearchText] = useState<string>(initialQuery ?? '');

  const handleSearchSubmit = useCallback(() => {
    onSearch(searchText);
  }, [onSearch, searchText]);

  return (
    <View flexDirection="row" alignItems="center" gap={'$4'}>
      <Input
        flex={1}
        size={'$3'}
        borderColor="$color.gray700" // Using a theme color for border
        borderWidth={1}
        borderRadius={8}
        px={10}
        placeholder="Search Models..."
        value={searchText}
        onChangeText={setSearchText}
        onSubmitEditing={handleSearchSubmit}
      />
      <Button size={'$3'} onPress={handleSearchSubmit} theme={'accent'}>
        Search
      </Button>
    </View>
  );
};

export default SearchBar;
