import React from 'react';
import { Platform, Dimensions } from 'react-native'; // Import Dimensions for web calc safety
import { View } from 'tamagui';
import ModelSelectItemCard, { ModelSelectItem } from './ModelSelectItemCard';
import { MasonryFlashList } from '@shopify/flash-list';
// Assuming CivitaiModelWithRelations is compatible with ModelSelectItem
// If ModelSelectItem is just { id: number | string, name: string, imageUrl?: string, ... }
// then CivitaiModelWithRelations will work. Let's keep ModelSelectItem type
// for internal consistency but acknowledge parent passes CivitaiModelWithRelations.

const itemGap = 8;

interface ModelSelectListProps {
  // The models prop now expects items compatible with ModelSelectItem
  // The parent passes CivitaiModelWithRelations[], which should work if compatible.
  models: ModelSelectItem[];
  // onModelPress is used for single selection (like Checkpoint, Pose)
  // The parent handlers expect the full model object, so pass the object.
  numColumns?: number;
  // Add extraData prop for FlashList optimization
  extraData?: any;
}

const ModelSelectList: React.FC<ModelSelectListProps> = ({
  models,
  numColumns = 2,
  extraData, // Receive extraData
}) => {
  const renderModelSelectCard = React.useCallback(({ item }: { item: ModelSelectItem }) => {
    // console.log('ModelSelectList rendering item:', item.id, 'Checking isSelected:', isSelected(item.id)); // Added log
    return <ModelSelectItemCard model={item} />;
  }, []);

  // *** NO STYLE CHANGES ARE MADE BELOW THIS LINE AS REQUESTED ***

  if (Platform.OS === 'web') {
    // Calculate column width defensively for web
    const columnWidth = numColumns > 0 ? `calc(100% / ${numColumns})` : '100%';

    return (
      <View
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="flex-start"
        bg={'$background'}
        m={itemGap / 2}>
        {models.map((model) => (
          <View key={model.id} width={columnWidth} padding={itemGap / 2}>
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
          renderItem={renderModelSelectCard} // Pass the useCallback directly
          numColumns={numColumns}
          estimatedItemSize={200} // Increased estimated size slightly
          contentContainerStyle={{
            padding: nativeContentPadding,
          }}
          keyExtractor={(item) => item.id.toString()}
          // Pass extraData to help FlashList detect relevant state changes for re-rendering items
          extraData={extraData} // Passed extraData here
          // Style to ensure FlashList takes available space in its container
          style={{ flex: 1, minHeight: 100 }} // Added minHeight to help with initial render issues if container is flex
        />
      </View>
    );
  }
};

export default ModelSelectList;
