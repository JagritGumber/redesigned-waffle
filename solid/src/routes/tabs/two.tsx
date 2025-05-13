import { createFileRoute } from "@tanstack/solid-router";
import { useStore } from "@tanstack/solid-store";
import axios from "axios";
import { createSignal, Show } from "solid-js";
import { ModelList } from "~/components/model-list";
import { Button } from "~/components/ui/button";
import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import {
  TextFieldTextArea,
  TextField,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { Toggle } from "~/components/ui/toggle";
import useGenerationModels from "~/hooks/useGenerationModels";
import { generationStore } from "~/store/generation";

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
  const ckQuery = useGenerationModels("checkpoints");
  const lrQuery = useGenerationModels("loras");
  const ttiQuery = useGenerationModels("textual-inversions");
  const hnQuery = useGenerationModels("hypernetworks");
  const agQuery = useGenerationModels("aesthetic-gradients");
  const cnQuery = useGenerationModels("controlnets");
  const psQuery = useGenerationModels("poses");

  const [prompt, setPrompt] = createSignal("");
  const [negativePrompt, setNegativePrompt] = createSignal("");
  const [width, setWidth] = createSignal(1280);
  const [height, setHeight] = createSignal(768);
  const [numImages, setNumImages] = createSignal(1);
  const [seed, setSeed] = createSignal(
    Number.parseInt((Math.random() * 1_000_000_000).toString())
  );
  const [useRandomSeed, setUseRandomSeed] = createSignal(true);
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [canGenerate, setCanGenerate] = createSignal(true);
  const selectedCheckpoint = useStore(
    generationStore,
    (state) => state.checkpoint
  );
  const selectedLoras = useStore(generationStore, (state) => state.lora);
  const selectedTti = useStore(
    generationStore,
    (state) => state.textualInversions
  );

  const buildPayload = () => {
    const payload = {
      modelId: selectedCheckpoint()?.id,
      loras: selectedLoras()?.map((lora) => ({
        id: lora.model.id,
        weight: lora.weight,
      })),
      textualInversions: selectedTti()?.map(({ tti, type }) => ({
        id: tti.id,
        weight: 0.6,
      })),
    };

    return payload;
  };

  const handleTestGenerate = async () => {
    const payload = buildPayload();
    await axios.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/generate`,
      payload
    );
  };

  const handleBatchGenerate = () => {};

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
      <TextField>
        <TextFieldLabel>Negative Prompt</TextFieldLabel>
        <TextFieldTextArea
          placeholder="Enter Negative Prompt"
          value={negativePrompt()}
          onInput={(e) => setNegativePrompt(e.currentTarget.value)}
        />
      </TextField>

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
          <NumberFieldInput placeholder="-1 for random" value={seed()} />
        </NumberField>
        <Toggle pressed={useRandomSeed()} onChange={setUseRandomSeed}>
          Random Seed
        </Toggle>
      </div>

      <div class="flex gap-2 mt-4">
        <Button
          onClick={handleTestGenerate}
          disabled={!canGenerate() || isGenerating()}
          class="flex-1"
        >
          {isGenerating() ? "Generating..." : "Test Generate (1 Image)"}
        </Button>
        <Button
          onClick={handleBatchGenerate}
          disabled={!canGenerate() || isGenerating() || numImages() <= 1}
          class="flex-1"
        >
          {isGenerating() ? "Generating Batch..." : "Batch Generate"}
        </Button>
      </div>
    </main>
  );
}
