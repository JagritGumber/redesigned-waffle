import { createSignal, Show, createEffect } from "solid-js";
import {
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose, // Import DrawerClose
} from "~/components/ui/drawer";
import { Button } from "~/components/ui/button";
import { ButtonGroup } from "~/components/ui/button-group";
import {
  TextField, // Keep TextField for TextField.Root
  TextFieldInput,
  TextFieldLabel,
  TextFieldTextArea,
} from "~/components/ui/text-field";

import { useMutation } from "@tanstack/solid-query"; // Import useMutation
import type { PostDetails } from "~/routes/gallery.$id"; // Import PostDetails type
import axios from "axios"; // Import axios
import { Loader } from "~/components/loader"; // Import Loader
import { createAlova } from "alova";
import GlobalFetch from "alova/fetch";
import SolidHook from "alova/solid";
import { useRequest } from "alova/client";

interface PostImageDrawerProps {
  currentImageId: string | undefined;
}

export function PostImageDrawer(props: PostImageDrawerProps) {
  const alovaInstance = createAlova({
    baseURL: import.meta.env.VITE_BACKEND_URL,
    requestAdapter: GlobalFetch(),
    statesHook: SolidHook,
  });

  const [platform, setPlatform] = createSignal<"deviantart" | "patreon">("deviantart");
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [tags, setTags] = createSignal("");
  const [selectedTier, setSelectedTier] = createSignal<string | undefined>(undefined);

  // Define available tiers
  const tiers = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];

  // Alova request to fetch post details
  const {
    loading: postDetailsLoading,
    data: postDetailsData,
    send: fetchPostDetails,
  } = useRequest(
    (imageId: string) =>
      alovaInstance.Get<PostDetails>(`/api/v1/images/post-details/${imageId}`, {
        name: `postDetails-${imageId}`, // Unique name for caching
        credentials: "include",
      }),
    {
      initialData: undefined, // it initially can either be undefined or {}
    },
  );

  // Effect to trigger data fetching when currentImageId changes
  createEffect(() => {
    if (props.currentImageId) {
      fetchPostDetails(props.currentImageId, { force: true });
    } else {
      // Clear fields when no image is selected (drawer closed)
      setTitle("");
      setDescription("");
      setTags("");
      setSelectedTier(undefined);
    }
  });

  // Effect to update form fields when postDetailsData changes (after fetch completes)
  createEffect(() => {
    const details = postDetailsData();
    if (!postDetailsLoading() && props.currentImageId) {
      if (details && details.imageId === props.currentImageId) {
        setTitle(details.title || "");
        setDescription(details.description || "");
        setTags(details.tags?.join(", ") || "");
        setSelectedTier(details.tier || undefined);
      } else {
        // If data is loaded but doesn't match currentImageId, or is null/undefined, clear fields
        setTitle("");
        setDescription("");
        setTags("");
        setSelectedTier(undefined);
      }
    }
  });

  // Internal mutation for generating and saving post details
  const generateAndSavePostDetailsMutation = useMutation(() => ({
    mutationFn: async (payload: {
      imageId: string;
      currentTitle?: string;
      currentDescription?: string;
      currentTags?: string[];
      forceRegenerate?: boolean; // Add new optional field
    }) => {
      const { forceRegenerate, ...restPayload } = payload;
      const finalPayload = {
        ...restPayload, // Always include currentTitle, currentDescription, currentTags (if present)
        forceRegenerate: forceRegenerate, // Always include forceRegenerate flag
      };

      if (forceRegenerate) {
        delete finalPayload.currentTitle;
        delete finalPayload.currentDescription;
        delete finalPayload.currentTags;
      }

      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/v1/images/generate-and-save-post-details`,
        finalPayload,
      );
      return response.data.data as PostDetails;
    },
    onSuccess: (data) => {
      // Explicitly update form fields with the new data
      setTitle(data.title || "");
      setDescription(data.description || "");
      setTags(data.tags?.join(", ") || "");
      setSelectedTier(data.tier || undefined);
      // Force Alova to refetch the latest draft, bypassing cache
      fetchPostDetails(data.imageId, { force: true });
    },
    onError: (error) => {
      console.error("Error generating and saving post details:", error);
      alert(`Failed to generate and save post details: ${error.message}`);
    },
  }));

  // Internal mutation for saving manually entered post details (without AI generation)
  const savePostDetailsMutation = useMutation(() => ({
    mutationFn: async (payload: {
      imageId: string;
      title: string;
      description: string;
      tags?: string[];
      platform?: "deviantart" | "patreon";
      tier?: string;
    }) => {
      const response = await axios.put(
        `${import.meta.env.VITE_BACKEND_URL}/api/v1/images/post-details`,
        payload,
      );
      return response.data.data as PostDetails;
    },
    onSuccess: (data) => {
      fetchPostDetails(data.imageId, { force: true }); // Force Alova to refetch, bypassing cache
      alert("Post details saved successfully!");
    },
    onError: (error) => {
      console.error("Error saving post details:", error);
      alert(`Failed to save post details: ${error.message}`);
    },
  }));

  // Internal mutation for initiating scrape and post
  const scrapeAndPostMutation = useMutation(() => ({
    mutationFn: async (payload: {
      imageId: string;
      platform?: "deviantart" | "patreon";
      tier?: string;
    }) => {
      try {
        const response = await axios.post(
          `${import.meta.env.VITE_BACKEND_URL}/api/v1/images/scrape-and-post`,
          payload,
        );
        return response.data;
      } catch (e) {
        console.error("Scrape and post failed:", e);
        throw new Error("Failed to initiate scrape and post.");
      }
    },
    onSuccess: (_data, payload) => {
      console.log(
        `Scraping and posting initiated for image ${payload.imageId} to ${payload.platform}.`,
      );
      alert(
        `Scraping and posting initiated for image ${payload.imageId} to ${payload.platform}. Check backend logs for progress.`,
      );
      fetchPostDetails(payload.imageId, { force: true }); // Force Alova to refetch, bypassing cache
    },
    onError: (error) => {
      console.error("Error initiating scrape and post:", error);
      alert(`Failed to initiate scrape and post: ${error.message}`);
    },
  }));

  const handlePostSubmit = (e: Event) => {
    e.preventDefault();
    if (!platform()) {
      alert("Platform is required.");
      return;
    }
    if (!props.currentImageId) {
      alert("Cannot post: Image ID is missing.");
      return;
    }
    scrapeAndPostMutation.mutate({
      imageId: props.currentImageId,
      platform: platform(),
      tier: selectedTier(),
    });
  };

  const handleSaveDraft = () => {
    if (!props.currentImageId) {
      alert("Cannot save draft: Image ID is missing.");
      return;
    }
    savePostDetailsMutation.mutate({
      imageId: props.currentImageId,
      title: title(),
      description: description(),
      tags: tags()
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      platform: platform(),
      tier: selectedTier(),
    });
  };

  const handleGenerateDraft = (forceRegenerate: boolean) => {
    if (!props.currentImageId) {
      alert("Cannot generate draft: Image ID is missing.");
      return;
    }

    const payload: {
      imageId: string;
      currentTitle?: string;
      currentDescription?: string;
      currentTags?: string[];
      forceRegenerate?: boolean;
    } = {
      imageId: props.currentImageId,
      forceRegenerate: forceRegenerate,
    };

    if (!forceRegenerate) {
      payload.currentTitle = title();
      payload.currentDescription = description();
      payload.currentTags = tags()
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    generateAndSavePostDetailsMutation.mutate(payload);
  };

  return (
    <DrawerContent onPointerDown={(e) => e.stopPropagation()}>
      <DrawerHeader>
        <DrawerTitle>Post Image</DrawerTitle>
        <DrawerDescription>Enter details to post this image to a platform.</DrawerDescription>
      </DrawerHeader>
      <Show when={!postDetailsLoading()} fallback={<Loader />}>
        <form onSubmit={handlePostSubmit} class="p-4 space-y-4">
          <div class="space-y-2">
            <TextField>
              <TextFieldLabel>Platform</TextFieldLabel>
              <div onPointerDown={(e) => e.stopPropagation()}>
                <ButtonGroup
                  value={platform()}
                  onChange={(value) => setPlatform(value as "deviantart" | "patreon")}
                  options={["deviantart", "patreon"]}
                />
              </div>
            </TextField>
          </div>

          <TextField>
            <TextFieldLabel>Title</TextFieldLabel>
            <TextFieldInput
              value={title()}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder="A catchy title for your post" // Improved placeholder
              required
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Description</TextFieldLabel>
            <TextFieldTextArea
              value={description()}
              onChange={(e) => setDescription(e.currentTarget.value)}
              placeholder="Provide a detailed description for your image" // Improved placeholder
              rows={4}
              required
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Tags (comma-separated)</TextFieldLabel>
            <TextFieldInput
              value={tags()}
              onChange={(e) => setTags(e.currentTarget.value)}
              placeholder="e.g., digital art, fantasy, character design" // Improved placeholder
            />
          </TextField>

          {/* New Tier Selection Field */}
          <TextField>
            <TextFieldLabel>Visibility Tier</TextFieldLabel>
            <div onPointerDown={(e) => e.stopPropagation()}>
              <ButtonGroup
                value={selectedTier()}
                onChange={(value: string) => setSelectedTier(value)}
                options={tiers}
              />
            </div>
          </TextField>

          <DrawerFooter class="flex flex-row gap-2 p-0">
            <Button
              type="button"
              onClick={() => handleGenerateDraft(false)} // Generate (or enhance)
              disabled={
                generateAndSavePostDetailsMutation.isPending ||
                !props.currentImageId ||
                scrapeAndPostMutation.isPending ||
                savePostDetailsMutation.isPending
              }
            >
              <Show when={generateAndSavePostDetailsMutation.isPending} fallback="Generate Draft">
                Generating...
              </Show>
            </Button>
            <Button
              type="button"
              onClick={() => handleGenerateDraft(true)} // Regenerate (from scratch)
              disabled={
                generateAndSavePostDetailsMutation.isPending ||
                !props.currentImageId ||
                scrapeAndPostMutation.isPending ||
                savePostDetailsMutation.isPending
              }
            >
              <Show when={generateAndSavePostDetailsMutation.isPending} fallback="Regenerate Draft">
                Regenerating...
              </Show>
            </Button>

            <Button
              type="button"
              onClick={handleSaveDraft}
              disabled={
                savePostDetailsMutation.isPending ||
                !props.currentImageId ||
                scrapeAndPostMutation.isPending ||
                generateAndSavePostDetailsMutation.isPending
              }
            >
              <Show when={savePostDetailsMutation.isPending} fallback="Save Draft">
                Saving...
              </Show>
            </Button>

            <Button
              type="submit"
              onClick={handlePostSubmit} // Use the new handler for the submit button
              disabled={
                scrapeAndPostMutation.isPending ||
                savePostDetailsMutation.isPending ||
                generateAndSavePostDetailsMutation.isPending
              }
            >
              <Show when={scrapeAndPostMutation.isPending} fallback="Post">
                Posting...
              </Show>
            </Button>
            <DrawerClose>
              <Button
                type="button"
                variant="outline"
                disabled={
                  scrapeAndPostMutation.isPending ||
                  savePostDetailsMutation.isPending ||
                  generateAndSavePostDetailsMutation.isPending
                }
              >
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </Show>
    </DrawerContent>
  );
}
