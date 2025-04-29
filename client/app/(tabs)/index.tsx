import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'tamagui'; // Import View from Tamagui
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
      <View f={1} bg={'$background'}>
        <GroupList onGroupUpdated={handleGroupUpdated} />
      </View>
    </>
  );
}
