import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';

import { StyleSheet, View } from 'react-native';
import GroupList from '~/components/GroupList';

export default function Home() {
  const [refreshGroups, setRefreshGroups] = useState<boolean>(false);

  const handleGroupCreated = useCallback(() => {
    setRefreshGroups((prev) => !prev);
  }, []);

  const handleGroupUpdated = useCallback(() => {
    setRefreshGroups((prev) => !prev);
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'My Groups' }} />
      <View style={styles.container}>
        <GroupList onGroupUpdated={handleGroupUpdated} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
