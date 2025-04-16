// components/ModelSelectList.tsx
import { Dimensions } from 'react-native';
import { View } from 'tamagui';
import ModelSelectItemCard, { ModelSelectItem } from './ModelSelectItemCard';

const cardMarginBase = 8;
const cardGapBase = 8;

interface ModelSelectListProps {
  models: ModelSelectItem[];
  selectedModelId?: string | number | null; // For single selection
  selectedModelIds?: (string | number)[]; // For multiple selection
  onModelPress?: (model: ModelSelectItem) => void; // For single selection
  onModelSelect?: (modelId: string | number) => void; // For multiple selection
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
  const cardWidth = `calc(${100 / numColumns}% - ${cardGapBase}px)`;
  const marginRight = cardGapBase;
  const marginBottom = cardGapBase;

  const handleCardPress = (model: ModelSelectItem) => {
    if (onModelPress) {
      onModelPress(model);
    } else if (onModelSelect) {
      onModelSelect(model.id);
    }
  };

  const isItemSelected = (modelId: string | number) => {
    if (selectedModelId !== undefined && selectedModelId !== null) {
      return selectedModelId === modelId;
    } else if (selectedModelIds) {
      return selectedModelIds.includes(modelId);
    }
    return false;
  };

  return (
    <View
      flexDirection="row"
      flexWrap="wrap"
      justifyContent="flex-start"
      paddingHorizontal={cardMarginBase}
    >
      {models.map((model, index) => (
        <View
          key={model.id}
          width={cardWidth}
          marginBottom={marginBottom}
          marginRight={(index + 1) % numColumns !== 0 ? marginRight : undefined}
        >
          <ModelSelectItemCard
            model={model}
            isSelected={isItemSelected(model.id)}
            onPress={handleCardPress}
          />
        </View>
      ))}
    </View>
  );
};

export default ModelSelectList;
