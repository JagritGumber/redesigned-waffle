import React, { useCallback, useState } from 'react';
import { Button, Input, Label, Card, Text, View } from 'tamagui';

interface CreateGroupButtonProps {
  onGroupCreated: () => void;
}

function CreateGroupButton({ onGroupCreated }: CreateGroupButtonProps) {
  const [showInput, setShowInput] = useState<boolean>(false);
  const [groupName, setGroupName] = useState<string>('');
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim()) {
      return;
    }
    setIsCreating(true);
    setCreationError(null);
    try {
      const response = await fetch('http://127.0.0.1:8787/api/v1/group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: groupName }),
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      setGroupName('');
      setShowInput(false);
      if (onGroupCreated) {
        onGroupCreated(); // Callback to refresh the list
      }
    } catch (e: any) {
      setCreationError(e.message);
    } finally {
      setIsCreating(false);
    }
  }, [groupName, onGroupCreated]);

  const handleInputChange = useCallback((text: string) => {
    setGroupName(text);
  }, []);

  const toggleInput = useCallback(() => {
    setShowInput(!showInput);
  }, [showInput]);

  return (
    <View marginTop="$6">
      <Text marginBottom="$4" fontSize="$5" fontWeight="bold">
        Create New Group
      </Text>
      {!showInput ? (
        <Button onPress={toggleInput}>Create New Group</Button>
      ) : (
        <Card elevate size="$4" bordered width={300}>
          <Card.Header padding="$4" space="$3">
            <View space="$2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input id="group-name" value={groupName} onChangeText={handleInputChange} />
            </View>
            <View flexDirection="row" space="$2">
              <Button onPress={handleCreateGroup} disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
              <Button variant="outlined" onPress={toggleInput}>
                Cancel
              </Button>
            </View>
            {creationError && <Text color="$color.red500">{creationError}</Text>}
          </Card.Header>
        </Card>
      )}
    </View>
  );
}

export default CreateGroupButton;
