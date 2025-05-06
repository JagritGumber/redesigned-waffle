// src/app/post/templates/index.tsx

import { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Text,
  YStack,
  XStack,
  useTheme,
  Paragraph,
  Separator,
  ScrollView,
  Spinner,
} from 'tamagui';
import { Plus, FolderKanban, Trash2 } from '@tamagui/lucide-icons';
import { Link, useRouter } from 'expo-router';
import { fetchTemplates, deleteTemplate } from '~/api/templates'; // Import API functions
import { PostTemplate } from '~/api/templates'; // Import the type

const TemplatesList = () => {
  const router = useRouter();
  const theme = useTheme();

  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null); // State to track which item is being deleted

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTemplates();
      setTemplates(data);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      setError(`Failed to load templates: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load templates on mount and when returning to this screen (optional, but good for freshness)
  useEffect(() => {
    loadTemplates();
    // Depending on navigation structure, you might need a focus listener
    // const unsubscribe = router.addListener('focus', loadTemplates);
    // return unsubscribe;
  }, [loadTemplates]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Are you sure you want to delete this template?')) {
        // Use browser/native confirm
        return;
      }

      setDeletingId(id);
      setError(null);
      try {
        await deleteTemplate(id);
        // Remove the deleted item from state
        setTemplates((prevTemplates) => prevTemplates.filter((t) => t.id !== id));
        // Optional: show success message
        // setError(`Template deleted successfully.`); // Re-using error state for messages briefly
      } catch (err: any) {
        console.error(`Failed to delete template ${id}:`, err);
        setError(`Failed to delete template: ${err.message}`);
      } finally {
        setDeletingId(null);
      }
    },
    [] // No dependencies needed as it uses `setTemplates` via functional update
  );

  return (
    <YStack flex={1} backgroundColor={theme.background.get()}>
      <XStack
        padding="$3"
        gap={'$3'}
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor={theme.borderColor.get()}>
        {/* Removed back button from list page */}
        <Text fontSize="$6" fontWeight="bold" flex={1}>
          Saved Templates
        </Text>
        <Link href={{ pathname: '/post/templates/create' }} asChild>
          <Button
            size="$3"
            chromeless
            icon={Plus}
            aria-label="Create New Template"
            disabled={isLoading || deletingId !== null}>
            New
          </Button>
        </Link>
        <Button
          size="$3"
          chromeless
          icon={FolderKanban} // Or RefreshCw icon
          onPress={loadTemplates}
          aria-label="Refresh List"
          disabled={isLoading || deletingId !== null}>
          {isLoading ? <Spinner size="small" color={theme.color.get()} /> : 'Refresh'}
        </Button>
      </XStack>

      {isLoading && templates.length === 0 ? (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Spinner size="large" color={theme.color9.get()} />
          <Paragraph mt="$2" color={theme.color11.get()}>
            Loading templates...
          </Paragraph>
        </YStack>
      ) : error && templates.length === 0 ? (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Paragraph color={theme.red10.get()}>Error loading templates:</Paragraph>
          <Paragraph color={theme.red10.get()} fow="bold">
            {error}
          </Paragraph>
          <Button onPress={loadTemplates} mt="$4">
            Retry
          </Button>
        </YStack>
      ) : templates.length === 0 ? (
        <YStack flex={1} jc="center" ai="center" p="$4">
          <Paragraph>No saved templates found.</Paragraph>
          <Link href={{ pathname: '/post/templates/create' }} asChild>
            <Button mt="$4" icon={Plus}>
              Create Your First Template
            </Button>
          </Link>
        </YStack>
      ) : (
        <ScrollView flex={1}>
          <YStack padding="$4" space="$3">
            {templates.map((template) => (
              <Link
                href={{
                  pathname: '/post/templates/[id]',
                  params: {
                    id: template.id,
                  },
                }}
                asChild>
                <XStack
                  key={template.id}
                  ai="center"
                  space="$3"
                  p="$3"
                  br="$3"
                  bc="$borderColor"
                  bw={1}
                  pressStyle={{ backgroundColor: theme.borderColor.get() }}>
                  <YStack flex={1}>
                    <Text fontWeight="bold" numberOfLines={1}>
                      {template.name}
                    </Text>
                    <Paragraph size="$2" numberOfLines={1}>
                      {template.type === 'text'
                        ? `Text: ${template.title}`
                        : `Poll: ${template.title}`}
                    </Paragraph>
                  </YStack>
                  <Button
                    size="$3"
                    icon={
                      deletingId === template.id ? (
                        <Spinner size="small" color={theme.color.get()} />
                      ) : (
                        <Trash2 size="$1" />
                      )
                    }
                    onPress={(e) => {
                      e.stopPropagation(); // Prevent triggering row press
                      handleDelete(template.id);
                    }}
                    disabled={deletingId !== null}
                    circular
                    chromeless
                  />
                </XStack>
              </Link>
            ))}
          </YStack>
        </ScrollView>
      )}

      {/* Status/Error message below the list if needed */}
      {error &&
        templates.length > 0 && ( // Show error below list if data is present
          <Paragraph textAlign="center" color={theme.red10.get()} p="$2">
            {error}
          </Paragraph>
        )}
    </YStack>
  );
};

export default TemplatesList;
