// components/CivitAIMarketplace.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dimensions } from 'react-native';
import {
  Button,
  YStack,
  XStack,
  ScrollView,
  Spinner,
  Paragraph,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from 'tamagui';
import { useRouter } from 'expo-router';
import useDownloadedModels from '~/hooks/useDownloadedModels';
import DownloadedModelsList from '~/components/DownloadedModelsList';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const DownloadedModels = () => {
  const router = useRouter();
  const [numColumns, setNumColumns] = useState<number>(2);
  const { data, isLoading, isError, error, refetch } = useDownloadedModels();
  const allModels = useMemo(() => data?.models, [data]);
  const queryClient = useQueryClient();

  const updateColumns = useCallback(() => {
    const width = Dimensions.get('window').width;
    if (width >= 900) setNumColumns(4);
    else if (width >= 600) setNumColumns(3);
    else setNumColumns(2);
  }, []);

  const handleDeleteAll = async () => {
    try {
      const res = await axios.delete(
        `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/model?confirm=true`
      );
      console.log(res);
    } catch (e) {
      console.error(e);
    }
  };

  const { mutateAsync: deleteAllAsync } = useMutation({
    mutationFn: handleDeleteAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloadedModels'] });
    },
  });

  useEffect(() => {
    updateColumns();
    const subscription = Dimensions.addEventListener('change', updateColumns);
    return () => subscription?.remove();
  }, [updateColumns]);

  const openMarketplace = () => {
    router.navigate('/marketplace');
  };

  // == Render Logic ==
  return (
    <YStack flex={1} backgroundColor="$background" height={Dimensions.get('window').height - 64}>
      {/* Header */}
      <XStack
        padding="$3"
        gap={'$3'}
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor="$borderColor">
        <Button onPress={openMarketplace} size="$3" theme="accent" variant="outlined">
          Marketplace
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="$3" theme="error">
              Delete All
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
                <AlertDialogTitle>Delete All Models?</AlertDialogTitle>
                <AlertDialogDescription>
                  By pressing Delete, you accept you want to delete all the models
                </AlertDialogDescription>

                <XStack gap="$3" justifyContent="flex-end">
                  <AlertDialogCancel asChild>
                    <Button>Cancel</Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button theme="error" onPress={() => deleteAllAsync()}>
                      Delete
                    </Button>
                  </AlertDialogAction>
                </XStack>
              </YStack>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      </XStack>

      {/* Loading State (Initial Load) */}
      {isLoading && (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Spinner size="large" color="$blue10" />
          <Paragraph mt="$2" col="$color11">
            Loading Models...
          </Paragraph>
        </YStack>
      )}

      {/* Error State */}
      {isError &&
        !isLoading && ( // Don't show error during initial load spinner
          <YStack flex={1} jc="center" ai="center" p="$4">
            <Paragraph col="$red10">Error loading models:</Paragraph>
            <Paragraph col="$red10" fow="bold">
              {(error as Error)?.message || 'Unknown error'}
            </Paragraph>
            <Button onPress={() => refetch()} mt="$4">
              Retry
            </Button>
          </YStack>
        )}

      {/* Success State - No results */}
      {!isLoading && !isError && allModels?.length === 0 && (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Paragraph>No models found matching your criteria.</Paragraph>
        </YStack>
      )}

      {/* Success State - Show List */}
      {!isLoading && !isError && (allModels?.length ?? 0) > 0 && (
        <DownloadedModelsList
          models={allModels ?? []}
          numColumns={numColumns}
          isLoading={isLoading}
          isError={isError}
          error={error}
        />
      )}
    </YStack>
  );
};

export default DownloadedModels;
