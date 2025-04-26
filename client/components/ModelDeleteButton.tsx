// ./components/ModelDeleteButton.tsx
import React, { useCallback, useState } from 'react';
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
  Spinner, // Import Spinner
} from 'tamagui';
import { Alert } from 'react-native';
import { Trash, Hourglass, XCircle, Check } from '@tamagui/lucide-icons'; // Import icons
import { CivitaiModelWithRelations } from '~/backend/schema/models'; // Assuming you are using this type now
import { useDeleteModel } from '~/hooks/useDeleteModel'; // Import the hook

interface ModelDeleteButtonProps {
  model: CivitaiModelWithRelations; // Use CivitaiModelWithRelations type (must have the internal 'id' and 'status')
}

function ModelDeleteButton({ model }: ModelDeleteButtonProps) {
  // Use the mutation hook
  const { mutateAsync: startDelete, isPending: isInitiatingDelete } = useDeleteModel(); // Use isPending

  const handlePress = useCallback(() => {
    if (model.civitaiId === undefined || model.civitaiId === null) {
      console.log(model);
      console.error('Model ID is missing on the downloaded model data to initiate deletion.');
      Alert.alert('Error', 'Model ID missing for deletion.');
      return;
    }
    // Call the mutation function with the internal DB model ID
    startDelete(model.civitaiId);
  }, [model, startDelete]); // Depend on model.id and the mutation function

  // Determine button state and text based on model.status and loading
  // Read status directly from the model prop
  const modelStatus = model?.status;

  let buttonText = 'Delete File';
  let buttonIcon = <Trash size="$1" />;
  let buttonDisabled = false;
  let buttonTheme: any = 'red'; // Default theme

  if (isInitiatingDelete) {
    buttonText = 'Initiating...';
    buttonIcon = <Spinner size="small" color="$color" />;
    buttonDisabled = true;
    buttonTheme = 'gray';
  } else {
    switch (modelStatus) {
      case 'PENDING_DELETE':
        buttonText = 'Deleting...'; // Or 'Pending Deletion'
        buttonIcon = <Spinner size="small" color="$color" />; // Or <Hourglass />
        buttonDisabled = true; // Cannot initiate again while in progress
        buttonTheme = 'yellow'; // Indicate process is running
        break;
      case 'DELETED':
        buttonText = 'Deleted';
        buttonIcon = <Check size="$1" />;
        buttonDisabled = true; // Already deleted
        buttonTheme = 'green'; // Indicate successful deletion state
        break;
      case 'DELETE_FAILED':
        buttonText = 'Deletion Failed';
        buttonIcon = <XCircle size="$1" />;
        buttonDisabled = false; // Allow retry
        buttonTheme = 'red';
        break;
      case 'ACTIVE': // Model exists in DB
        // The button should allow deletion if the model record exists in the DB
        buttonText = 'Delete Model'; // Changed from "Delete File" as it changes DB status too
        buttonIcon = <Trash size="$1" />;
        buttonDisabled = false;
        buttonTheme = 'red';
        break;
      // Handle other potential statuses if needed (e.g., download statuses might affect deletion)
      default: // Should ideally not happen if model.status is typed correctly and model is not null
        buttonText = 'Delete Model';
        buttonIcon = <Trash size="$1" />;
        buttonDisabled = false;
        buttonTheme = 'red';
        break;
    }
  }

  // If the model record doesn't exist in our DB (`downloadedModel` was null in parent),
  // this button should not be shown by the parent component.
  // But adding a check here makes the component more robust.
  if (!model) {
    return null;
  }

  // AlertDialog logic remains mostly the same, just ensure the onPress calls handleDelete
  return (
    <AlertDialog native >
      <AlertDialogTrigger asChild  >
        <Button
          backgroundColor="$red2"
          hoverStyle={{ backgroundColor: '$red3' }}
          disabled={buttonDisabled} // Use the buttonDisabled state
          mt={10}
          w={'100%'}
          icon={buttonIcon} // Add icon to the trigger button
        >
          {buttonText} {/* Use the determined buttonText */}
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
            <AlertDialogTitle>Delete {model?.name || 'Model'}</AlertDialogTitle>{' '}
            {/* Use optional chaining */}
            <AlertDialogDescription>
              Are you sure you want to delete this model? This will remove the file from storage and
              mark the record as deleted in the database.
            </AlertDialogDescription>
            <XStack gap="$3" justifyContent="flex-end">
              <AlertDialog.Cancel asChild>
                <Button>Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button theme="error" onPress={handlePress} disabled={isInitiatingDelete}>
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
