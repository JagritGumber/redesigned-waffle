import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Card, Text, View } from 'tamagui'; // Assuming direct import
import ConnectPatreonButton from './ConnectPatreonButton'; // Ensure this is adapted for React Native/Tamagui
import ConnectDeviantArtButton from './ConnectDeviantArtButton'; // Ensure this is adapted for React Native/Tamagui
import CreateGroupButton from './CreateGroupButton'; // Import CreateGroupButton
import { Feather } from '@expo/vector-icons'; // Assuming you have this installed for icons

interface Group {
  id: string;
  name: string;
  patreonAccountId: string | null;
  deviantartAccountId: string | null;
  // Add other properties of your group object if necessary
}

interface GroupListProps {
  onGroupUpdated: () => void;
}

function GroupList({ onGroupUpdated }: GroupListProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editedGroupName, setEditedGroupName] = useState<string>('');

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/group`);
      setGroups(response.data.groups || []); // Assuming your backend returns { groups: [...] }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGroupCreated = useCallback(() => {
    fetchGroups(); // Refetch groups after a new one is created
  }, [fetchGroups]);

  const handleEditGroup = (group: Group) => {
    setEditingGroupId(group.id);
    setEditedGroupName(group.name);
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
  };

  const handleSaveGroup = async (id: string) => {
    try {
      await axios.patch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/group/${id}`, {
        name: editedGroupName,
      });
      fetchGroups(); // Refetch groups after update
      setEditingGroupId(null);
      if (onGroupUpdated) {
        onGroupUpdated();
      }
    } catch (e: any) {
      console.error('Error updating group:', e);
      setError(e.message); // Consider a more specific error message
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      try {
        await axios.delete(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/group/${id}`);
        fetchGroups(); // Refetch groups after delete
        if (onGroupUpdated) {
          onGroupUpdated();
        }
      } catch (e: any) {
        console.error('Error deleting group:', e);
        setError(e.message); // Consider a more specific error message
      }
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  if (loading) {
    return <Text>Loading groups...</Text>;
  }

  if (error) {
    return <Text>Error loading groups: {error}</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollViewContent}>
      <View style={styles.groupListContainer}>
        {groups.map((group) => (
          <Card key={group.id} style={styles.card}>
            <View padding={16} style={styles.cardHeader}>
              {editingGroupId === group.id ? (
                <TextInput
                  style={styles.editInput}
                  value={editedGroupName}
                  onChangeText={setEditedGroupName}
                  placeholder="Group Name"
                />
              ) : (
                <Text fontSize={18} fontWeight="bold">
                  {group.name}
                </Text>
              )}
              <View style={styles.actionButtons}>
                {editingGroupId === group.id ? (
                  <>
                    <TouchableOpacity
                      onPress={() => handleSaveGroup(group.id)}
                      style={styles.iconButton}>
                      <Feather name="check" size={20} color="$color.primary" />{' '}
                      {/* Using primary theme color */}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCancelEdit} style={styles.iconButton}>
                      <Feather name="x" size={20} color="$color.secondary" />{' '}
                      {/* Using secondary theme color */}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => handleEditGroup(group)}
                      style={styles.iconButton}>
                      <Feather name="edit" size={20} color="$color.primary" />{' '}
                      {/* Using primary theme color */}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteGroup(group.id)}
                      style={styles.iconButton}>
                      <Feather name="trash-2" size={20} color="$color.secondary" />{' '}
                      {/* Using secondary theme color */}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
            <View padding={16} style={styles.cardContent}>
              <ConnectPatreonButton
                groupId={group.id}
                onConnected={onGroupUpdated}
                isConnected={!!group.patreonAccountId}
              />
              <ConnectDeviantArtButton
                groupId={group.id}
                onConnected={onGroupUpdated}
                isConnected={!!group.deviantartAccountId}
              />
            </View>
          </Card>
        ))}
        {groups.length === 0 && <Text color="$color.gray300">No groups created yet.</Text>}
        <View style={styles.createButtonContainer}>
          <CreateGroupButton onGroupCreated={handleGroupCreated} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollViewContent: {
    padding: 16,
  },
  createButtonContainer: {
    marginBottom: 16, // Add some space between the button and the list
    alignItems: 'flex-start', // Adjust alignment as needed
  },
  groupListContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    flexBasis: '48%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardContent: {
    gap: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '$color.gray400',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 16,
  },
});

export default GroupList;
