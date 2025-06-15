import { createFileRoute } from "@tanstack/solid-router";
import { useStore } from "@tanstack/solid-store";
import axios from "axios";
import { createSignal, Show, For, createEffect } from "solid-js";
import { useQuery } from "@tanstack/solid-query";
import { ModelList } from "~/components/model-list";
import { Button } from "~/components/ui/button";
import { NumberField, NumberFieldInput, NumberFieldLabel } from "~/components/ui/number-field";
import { TextField, TextFieldTextArea, TextFieldLabel } from "~/components/ui/text-field";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import useGenerationModels from "~/hooks/useGenerationModels";
import {
  generationStore,
  setHeight,
  setNegativePrompt,
  setNumImages,
  setPrompt,
  setSeed,
  setWidth,
} from "~/store/generation";
import { type GenerateRequestPayloadType } from "~/backend/validators/generation";
import { Badge } from "~/components/ui/badge";
import type { SelectGeneratorPrompt } from "~/backend/schema/generatorPrompt";
import { toast } from "solid-sonner";

export const Route = createFileRoute("/tabs/two")({
  component: RouteComponent,
});

export const ASPECT_RATIOS = [
  "704*1408",
  "704*1344",
  "768*1344",
  "768*1280",
  "832*1216",
  "832*1152",
  "896*1152",
  "896*1088",
  "960*1088",
  "960*1024",
  "1024*1024",
  "1024*960",
  "1088*960",
  "1088*896",
  "1152*896",
  "1152*832",
  "1216*832",
  "1280*768",
  "1344*768",
  "1344*704",
  "1408*704",
  "1472*704",
  "1536*640",
  "1600*640",
  "1664*576",
  "1728*576",
];

function RouteComponent() {
  const [startingTags, setStartingTags] = createSignal("");
  const [generatedPrompt, setGeneratedPrompt] = createSignal("");
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedRatio, setSelectedRatio] = createSignal<string | null>(null);
  const [promptJobId, setPromptJobId] = createSignal<string | null>(null);
  const [isRandomSeedEnabled, setIsRandomSeedEnabled] = createSignal(true); // New state for random seed checkbox

  createEffect(() => {
    if (width() && height()) {
      setSelectedRatio(`${width()}*${height()}`);
    } else {
      setSelectedRatio(null);
    }
  });

  const ckQuery = useGenerationModels("checkpoints");
  const lrQuery = useGenerationModels("loras");
  const ttiQuery = useGenerationModels("textual-inversions");
  const hnQuery = useGenerationModels("hypernetworks");
  const agQuery = useGenerationModels("aesthetic-gradients");
  const cnQuery = useGenerationModels("controlnets");
  const psQuery = useGenerationModels("poses");

  const selectedCheckpoint = useStore(generationStore, (state) => state.checkpoint);
  const selectedLoras = useStore(generationStore, (state) => state.lora);
  const selectedTti = useStore(generationStore, (state) => state.textualInversions);
  const prompt = useStore(generationStore, (state) => state.prompt);
  const negativePrompt = useStore(generationStore, (state) => state.negativePrompt);
  const width = useStore(generationStore, (state) => state.width);
  const height = useStore(generationStore, (state) => state.height);
  const seed = useStore(generationStore, (state) => state.seed);
  const numImages = useStore(generationStore, (state) => state.numImages);
  const randomSeed = useStore(generationStore, (state) => state.randomSeed);

  const buildPayload = () => {
    const payload = {
      checkpoint: { ...selectedCheckpoint()!, weight: 0.6 },
      loras: selectedLoras() ?? [],
      textualInversions: selectedTti() ?? [],
      prompt: prompt(),
      width: width(),
      height: height(),
      seed: seed(),
      numImages: numImages(),
      negativePrompt: negativePrompt(),
      steps: 25,
    } satisfies GenerateRequestPayloadType;

    return payload;
  };

  const handleTestGenerate = async () => {
    if (!selectedCheckpoint()) {
      toast.error("Please select a checkpoint before generating.");
      return;
    }

    if (isRandomSeedEnabled()) {
      const newSeed = Math.floor(Math.random() * 1000000000000); // Generate a 12-digit random number
      setSeed(newSeed);
    }
    const payload = buildPayload();
    await axios.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/generate-image`,
      payload,
    );
  };

  const handleBatchGenerate = () => {};

  const generatePrompt = async (promptInput: string) => {
    setIsLoading(true);
    setGeneratedPrompt("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/generate-prompt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt: promptInput }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate prompt.");
      }

      const data = await response.json();
      const dbJobId = data.db_job_id;
      setPromptJobId(dbJobId);
      setGeneratedPrompt("Prompt generation job initiated. Waiting for completion...");
      console.log("Prompt generation job initiated:", data);
      // Polling will be handled by Tanstack Query
    } catch (err: any) {
      toast.error(`Prompt generation failed: ${err.message}`);
      setGeneratedPrompt("");
      setIsLoading(false);
    }
  };

  const promptStatusQuery = useQuery(() => ({
    queryKey: ["promptStatus", promptJobId()],
    queryFn: async () => {
      if (!promptJobId()) return null;
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/prompt-status/${promptJobId()}`,
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch prompt status.");
      }
      return (await response.json()) as { job: SelectGeneratorPrompt };
    },
    enabled: !!promptJobId(),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      if (
        status === "COMPLETED" ||
        status === "FAILED" ||
        status === "CANCELLED" ||
        status === "TIMED_OUT"
      ) {
        setIsLoading(false);
        return false; // Stop refetching
      }
      return 3000; // Poll every 3 seconds
    },
    onSuccess: (data: { job: SelectGeneratorPrompt } | null) => {
      if (!data) {
        // Add null check for data
        toast.error("No data received for prompt generation status.");
        setGeneratedPrompt("");
        return;
      }
      const jobStatus = data.job?.status; // Access job directly from data
      if (jobStatus === "COMPLETED") {
        setGeneratedPrompt(data.job.outputPayload.generated_prompt);
      } else if (jobStatus === "FAILED" || jobStatus === "CANCELLED" || jobStatus === "TIMED_OUT") {
        toast.error(data.job.errorMessage || "Prompt generation failed or was cancelled.");
        setGeneratedPrompt("");
      }
    },
    onError: (err: any) => {
      toast.error(`Polling error: ${err.message}`);
      setGeneratedPrompt("");
      setIsLoading(false);
    },
  }));

  createEffect(() => {
    if (promptStatusQuery.isFetching) {
      setIsLoading(true);
    } else if (promptStatusQuery.isSuccess || promptStatusQuery.isError) {
      setIsLoading(false);
    }
  });

  const handleGeneratePrompt = () => {
    generatePrompt(startingTags());
  };

  const handleRetry = () => {
    // Append a random number to the prompt to force a new generation
    const newPromptInput = `${startingTags()}, random_seed_${Math.floor(Math.random() * 1000000)}`;
    generatePrompt(newPromptInput);
  };

  return (
    <main class="flex flex-col gap-2 p-2">
      <Show when={(ckQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Checkpoint</h2>
        <ModelList query={ckQuery} class="p-0" selectable />
      </Show>
      <Show when={(lrQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Lora(s)</h2>
        <ModelList query={lrQuery} class="p-0" selectable />
      </Show>
      <Show when={(ttiQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Textual Inversion(s)</h2>
        <ModelList query={ttiQuery} class="p-0" selectable />
      </Show>
      <Show when={(hnQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Hyper Network(s)</h2>
        <ModelList query={hnQuery} class="p-0" />
      </Show>
      <Show when={(agQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Aesthetic Gradient(s)</h2>
        <ModelList query={agQuery} class="p-0" />
      </Show>
      <Show when={(cnQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Control Network(s)</h2>
        <ModelList query={cnQuery} class="p-0" />
      </Show>
      <Show when={(psQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Pose(s)</h2>
        <ModelList query={psQuery} class="p-0" />
      </Show>
      <TextField>
        <TextFieldLabel>Prompt</TextFieldLabel>
        <TextFieldTextArea
          placeholder="Enter Prompt"
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
        />
      </TextField>

      <div class="mb-4">
        <label for="startingTags" class="block text-sm font-medium text-gray-700 mb-1">
          Starting Tags for Prompt Generation:
        </label>
        <TextField>
          <TextFieldTextArea
            id="startingTags"
            placeholder="Enter starting tags, e.g., '1girl, solo, long hair'"
            value={startingTags()}
            onInput={(e) => setStartingTags(e.currentTarget.value)}
            rows={3}
          />
        </TextField>
      </div>

      <div class="flex gap-2 mb-4">
        <Button onClick={handleGeneratePrompt} disabled={isLoading()}>
          {isLoading() ? "Generating..." : "Generate Prompt"}
        </Button>
        <Button onClick={handleRetry} disabled={isLoading()} variant="outline">
          {isLoading() ? "Retrying..." : "Retry (New Seed)"}
        </Button>
      </div>

      {generatedPrompt() && (
        <div class="bg-gray-100 p-4 rounded-md mb-4">
          <h2 class="text-lg font-semibold mb-2">Generated Prompt:</h2>
          <p class="whitespace-pre-wrap">{generatedPrompt()}</p>
        </div>
      )}

      <TextField>
        <TextFieldLabel>Negative Prompt</TextFieldLabel>
        <TextFieldTextArea
          placeholder="Enter Negative Prompt"
          value={negativePrompt()}
          onInput={(e) => setNegativePrompt(e.currentTarget.value)}
        />
      </TextField>

      <h2 class="text-lg font-semibold mt-4">Aspect Ratios</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        <For each={ASPECT_RATIOS}>
          {(ratio) => (
            <Badge
              variant={selectedRatio() === ratio ? "default" : "outline"}
              onClick={() => {
                const [w, h] = ratio.split("*").map(Number);
                setWidth(w);
                setHeight(h);
                setSelectedRatio(ratio);
              }}
              class="cursor-pointer"
            >
              {ratio}
            </Badge>
          )}
        </For>
      </div>

      <div class="flex gap-2">
        <NumberField class="flex-1" onRawValueChange={setWidth}>
          <NumberFieldLabel>Width</NumberFieldLabel>
          <NumberFieldInput value={width()} />
        </NumberField>
        <NumberField class="flex-1" onRawValueChange={setHeight}>
          <NumberFieldLabel>Height</NumberFieldLabel>
          <NumberFieldInput value={height()} />
        </NumberField>
      </div>

      <NumberField onRawValueChange={setNumImages} minValue={1} maxValue={8}>
        <NumberFieldLabel>Number of Images (Batch Size)</NumberFieldLabel>
        <NumberFieldInput value={numImages()} />
      </NumberField>

      <div class="flex items-center gap-2">
        <NumberField class="flex-1" onRawValueChange={setSeed}>
          <TextFieldLabel>Seed</TextFieldLabel>
          <NumberFieldInput value={seed()} disabled={isRandomSeedEnabled()} />
        </NumberField>
        <div class="flex items-center space-x-2">
          <Checkbox
            id="random-seed-checkbox"
            checked={isRandomSeedEnabled()}
            onChange={setIsRandomSeedEnabled}
          />
          <Label for="random-seed-checkbox">Random Seed</Label>
        </div>
      </div>

      <div class="flex gap-2 mt-4">
        <Button onClick={handleTestGenerate} class="flex-1">
          {"Test Generate (1 Image)"}
        </Button>
        <Button onClick={handleBatchGenerate} class="flex-1">
          {"Batch Generate"}
        </Button>
      </div>
    </main>
  );
}
