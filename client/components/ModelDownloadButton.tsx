// ./components/ModelDownloadButton.tsx
import React from 'react';
import { Button, Spinner, Text } from 'tamagui';
import { StyleSheet, Alert } from 'react-native'; // Keep Alert for now
import { Download, Check, XCircle, Hourglass, Trash } from '@tamagui/lucide-icons';
import { Model as CivitaiApiModel } from '~/types/civitai';
import { CivitaiModelWithRelations } from '~/backend/schema/models'; // Your backend DB model type
import { useDownloadModel } from '~/hooks/useDownloadModel'; // Import the hook

interface ModelDownloadButtonProps {
  civitaiModel: CivitaiApiModel | null; // The original Civitai API model data
  downloadedModel?: CivitaiModelWithRelations | null; // The model data fetched from your backend
}

const ModelDownloadButton: React.FC<ModelDownloadButtonProps> = ({
  civitaiModel,
  downloadedModel,
}) => {
  // Use the mutation hook
  const { mutate: startDownload, isPending: isInitiatingDownload } = useDownloadModel(); // Use isPending for initiation state

  // Find the primary file from the downloaded model data (if it exists)
  const latestDownloadedVersion = downloadedModel?.versions?.[0];
  const primaryDownloadedFile = latestDownloadedVersion?.files?.find((file) => file.primary);

  // Get the status from the downloaded model data
  // Default to 'NONE' if downloadedModel or primary file doesn't exist
  const downloadStatus = primaryDownloadedFile?.downloadStatus ?? 'NONE';

  const handlePress = () => {
    console.log('I was pressed');
    if (!civitaiModel) {
      console.error('No Civitai model data available to start download.');
      Alert.alert('Error', 'Model data missing for download.');
      return;
    }
    // Call the mutation function
    startDownload(civitaiModel ?? downloadedModel);
  };

  // Determine button state and text based on status and loading
  let buttonText = 'Download';
  let buttonIcon = <Download size="$1" />;
  let buttonDisabled = false;
  let buttonTheme: any = 'blue'; // Default theme

  if (isInitiatingDownload) {
    buttonText = 'Initiating...';
    buttonIcon = <Spinner size="small" color="$color" />; // Use Spinner from tamagui
    buttonDisabled = true;
    buttonTheme = 'gray';
  } else {
    switch (downloadStatus) {
      case 'PENDING':
        buttonText = 'Download (Pending)';
        buttonIcon = <Hourglass size="$1" />;
        buttonDisabled = true; // Cannot initiate again while pending
        buttonTheme = 'orange';
        break;
      case 'IN_PROGRESS':
        buttonText = 'Downloading...';
        buttonIcon = <Spinner size="small" color="$color" />;
        buttonDisabled = true; // Cannot initiate again while in progress
        buttonTheme = 'yellow';
        break;
      case 'COMPLETED':
        buttonText = 'Downloaded';
        buttonIcon = <Check size="$1" />;
        buttonDisabled = true; // Already downloaded
        buttonTheme = 'green';
        break;
      case 'ERROR':
        buttonText = 'Download Failed';
        buttonIcon = <XCircle size="$1" />;
        buttonDisabled = false; // Allow retry
        buttonTheme = 'red';
        break;
      case 'NONE': // Model record or primary file not found in your DB
      default:
        buttonText = 'Download';
        buttonIcon = <Download size="$1" />;
        buttonDisabled = false; // Allow initiating the process
        buttonTheme = 'blue';
        break;
    }
  }

  // Add a check if the entire model is marked as DELETED
  if (downloadedModel?.status === 'DELETED') {
    buttonText = 'Deleted';
    buttonIcon = <Trash size="$1" />; // Or a different icon
    buttonDisabled = true; // Cannot download if marked as deleted
    buttonTheme = 'red';
  }
  // Add check for deletion in progress/failed as well if you want to disable download during those states
  if (downloadedModel?.status === 'PENDING_DELETE') {
    buttonText = 'Deleting...';
    buttonIcon = <Spinner size="small" color="$color" />;
    buttonDisabled = true;
    buttonTheme = 'yellow'; // Indicate deletion is happening
  }

  return (
    <Button
      theme={buttonTheme}
      icon={buttonIcon}
      onPress={handlePress}
      disabled={buttonDisabled}
      size="$3"
      style={styles.downloadButton} // Apply styles here
    >
      {buttonText}
    </Button>
  );
};

const styles = StyleSheet.create({
  downloadButton: {
    width: '100%',
    marginTop: 10, // Adjust spacing as needed
  },
});

export default ModelDownloadButton;
