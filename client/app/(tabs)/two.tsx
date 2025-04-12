import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import CivitAIMarketplace from '~/components/CivitAIMarketplace'; // Import the new component

export default function Home() {
  return (
    <>
      <Stack.Screen options={{ title: 'Civit AI Marketplace' }} /> {/* Update the title */}
      <View style={styles.container}>
        <CivitAIMarketplace />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
