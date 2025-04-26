import React from 'react';
import { Platform } from 'react-native';
import { View } from 'tamagui';
import ModelSelectItemCard, { ModelSelectItem } from './ModelSelectItemCard';
import { MasonryFlashList } from '@shopify/flash-list';

const itemGap = 8;

interface ModelSelectListProps {
  models: ModelSelectItem[];
  selectedModelId?: string | number | null;
  selectedModelIds?: (string | number)[];
  onModelPress?: (model: ModelSelectItem) => void;
  onModelSelect?: (modelId: string | number) => void;
  numColumns?: number;
}

const ModelSelectList: React.FC<ModelSelectListProps> = ({
  models,
  selectedModelId,
  selectedModelIds,
  onModelPress,
  onModelSelect,
  numColumns = 2,
}) => {
  const handleCardPress = React.useCallback(
    (model: ModelSelectItem) => {
      if (onModelPress) {
        onModelPress(model);
      } else if (onModelSelect) {
        onModelSelect(model.id);
      }
    },
    [onModelPress, onModelSelect]
  );

  const isItemSelected = React.useCallback(
    (modelId: string | number) => {
      if (selectedModelId !== undefined && selectedModelId !== null) {
        return selectedModelId === modelId;
      } else if (selectedModelIds) {
        return selectedModelIds.includes(modelId);
      }
      return false;
    },
    [selectedModelId, selectedModelIds]
  );

  const renderModelSelectCard = React.useCallback(
    ({ item }: { item: ModelSelectItem }) => {
      return (
        <ModelSelectItemCard
          model={item}
          isSelected={isItemSelected(item.id)}
          onPress={() => handleCardPress(item)}
        />
      );
    },
    [isItemSelected, handleCardPress]
  );

  if (Platform.OS === 'web') {
    return (
      <View
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="flex-start"
        bg={'$background'}
        m={itemGap / 2}>
        {models.map((model) => (
          <View key={model.id} width={`calc(100% / ${numColumns})`} padding={itemGap / 2}>
            {renderModelSelectCard({ item: model })}
          </View>
        ))}
      </View>
    );
  } else {
    const nativeItemWrapperPadding = itemGap / 2;
    const nativeContentPadding = itemGap / 2;

    return (
      <View>
        <MasonryFlashList
          data={models}
          renderItem={({ item }) => (
            <View padding={nativeItemWrapperPadding}>{renderModelSelectCard({ item })}</View>
          )}
          numColumns={numColumns}
          estimatedItemSize={150}
          contentContainerStyle={{
            padding: nativeContentPadding,
          }}
          keyExtractor={(item) => item.id.toString()}
          style={{ flex: 1 }}
        />
      </View>
    );
  }
};

export default ModelSelectList;
