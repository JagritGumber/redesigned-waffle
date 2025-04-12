import { useCallback } from 'react';
import { Button } from 'tamagui';
import { StyleSheet, Alert } from 'react-native';
import axios from 'axios';

interface ModelDownloadButtonProps {
  modelId: number;
}

function ModelDownloadButton({ modelId }: ModelDownloadButtonProps) {
  const handleDownload = useCallback(async () => {
    try {
      // Construct the full backend download URL
      const downloadUrl = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model`;

      // Open the URL in the device's default browser
      const res = await axios.post(downloadUrl, {
        modelId,
      });
    } catch (error) {
      console.error('Download Trigger Error:', error);
      Alert.alert('Error', 'Failed to initiate download.');
    }
  }, [modelId]);

  return (
    <Button onPress={handleDownload} style={styles.downloadButton}>
      Download
    </Button>
  );
}

const styles = StyleSheet.create({
  downloadButton: {
    width: '100%',
    marginTop: 10, // Adjust spacing as needed
  },
});

export default ModelDownloadButton;
