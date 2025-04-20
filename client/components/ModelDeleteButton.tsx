import { useCallback, useState } from 'react';
import {
  Button,
  AlertDialog,
  YStack,
  XStack,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogPortal,
} from 'tamagui';
import { Alert } from 'react-native';
import axios from 'axios';
import { CivitaiModelWithRelations } from '~/backend/schema/models'; // Assuming you are using this type now
import { useQueryClient } from '@tanstack/react-query';

interface ModelDeleteButtonProps {
  model: CivitaiModelWithRelations; // Use CivitaiModelWithRelations type
}

function ModelDeleteButton({ model }: ModelDeleteButtonProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleDelete = useCallback(async () => {
    setLoading(true);
    try {
      const deleteUrl = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model/${model.id}`; // Construct DELETE URL with model ID
      await axios.delete(deleteUrl);

      // Invalidate queries for this model type after successful deletion
      queryClient.invalidateQueries({
        queryKey: ['models', model.type.toLowerCase().replace(/ /g, '-')],
      });
      Alert.alert('Success', 'Model deleted successfully!');
    } catch (error: any) {
      console.error('Model Delete Error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to delete model.');
    } finally {
      setLoading(false);
    }
  }, [model, queryClient]);

  return (
    <AlertDialog native>
      <AlertDialogTrigger asChild>
        <Button
          backgroundColor="$red2"
          hoverStyle={{ backgroundColor: '$red3' }}
          disabled={loading}
          mt={10}
          w={'100%'}>
          Delete Model
        </Button>
      </AlertDialogTrigger>
      <AlertDialogPortal>
        <AlertDialogOverlay
          key="overlay"
          animation="quick"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <AlertDialogContent
          bordered
          elevate
          key="content"
          animation={[
            'quick',
            {
              opacity: {
                overshootClamping: true,
              },
            },
          ]}
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          x={0}
          scale={1}
          opacity={1}
          y={0}>
          <YStack gap="$4">
            <AlertDialogTitle>Delete {model.name}</AlertDialogTitle>
            <AlertDialogDescription>
              By pressing Delete, you accept you want to delete this model
            </AlertDialogDescription>

            <XStack gap="$3" justifyContent="flex-end">
              <AlertDialog.Cancel asChild>
                <Button>Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button theme="error" onPress={() => handleDelete()}>
                  Delete
                </Button>
              </AlertDialog.Action>
            </XStack>
          </YStack>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
}

export default ModelDeleteButton;
