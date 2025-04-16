// Assuming this file is in app/tab3.js (or a similar location based on your expo-router setup)
import { Dimensions } from 'react-native';
import { View } from 'tamagui';
import ImageGenerationScreen from '~/components/ImageGenerationScreen';

export default function TabThree() {
  return (
    <View f={1} height={Dimensions.get("window").height - 60} >
      <ImageGenerationScreen />
    </View>
  );
}

