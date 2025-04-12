// Assuming this file is in app/tab3.js (or a similar location based on your expo-router setup)
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import ImageGenerationScreen from '~/components/ImageGenerationScreen';

export default function TabThree() {
  return (
    <>
      <Stack.Screen options={{ title: 'Image Generation' }} />
      <View style={styles.container}>
        <ImageGenerationScreen />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
