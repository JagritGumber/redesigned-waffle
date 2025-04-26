import {
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogTrigger,
  AlertDialogPortal,
  YStack,
  AlertDialogTitle,
  AlertDialogDescription,
  XStack,
  AlertDialogContent,
  AlertDialogOverlay,
} from 'tamagui';

export default function CreateNewPollButton() {
  return (
    <AlertDialog native>
      <AlertDialogTrigger asChild>
        <Button>Create New Poll</Button>
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
            <AlertDialogTitle>Create New Poll</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this model? This will remove the file from storage and
              mark the record as deleted in the database.
            </AlertDialogDescription>
            <XStack gap="$3" justifyContent="flex-end">
              <AlertDialog.Cancel asChild>
                <Button>Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button theme="error">Create</Button>
              </AlertDialog.Action>
            </XStack>
          </YStack>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
