import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldTextArea } from "~/components/ui/text-field";

export const Route = createFileRoute("/tabs/flow")({
  component: FlowComponent,
});

function FlowComponent() {
  const [startingTags, setStartingTags] = createSignal("");
  const [generatedPrompt, setGeneratedPrompt] = createSignal("");
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const generatePrompt = async (promptInput: string) => {
    setIsLoading(true);
    setError(null);
    setGeneratedPrompt("");

    try {
      const response = await fetch("/api/v1/generator/generate-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: promptInput }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate prompt.");
      }

      const data = await response.json();
      // Assuming the backend returns { generated_prompt: "..." }
      // The RunPod handler returns { generated_prompt: full_prompt }
      // The manager router returns { status: "accepted", message: "...", db_job_id: "...", runpod_job_id: "..." }
      // We need to poll for the result or rely on webhooks.
      // For simplicity, let's assume the manager returns the prompt directly for now,
      // or we'll need to implement polling for the job status.

      // Given the manager/src/routers/v1/generatorRouter.ts, it returns job IDs.
      // So, we need to fetch the job status.
      // This will require another API call to /api/v1/generator/images (which fetches jobs)
      // or a new endpoint to get a single job by ID.

      // For now, I'll simulate the direct return of the prompt for immediate feedback.
      // A more robust solution would involve polling the job status.
      // Let's assume the manager will eventually return the generated prompt directly for this endpoint.
      // If not, I'll need to add a new endpoint to fetch job results.

      // For now, I'll just set a placeholder.
      // TODO: Implement actual job status polling or direct prompt return from manager.
      setGeneratedPrompt("Prompt generation job initiated. Please check backend logs for status. (Frontend polling not yet implemented)");
      console.log("Prompt generation job initiated:", data);

    } catch (err: any) {
      setError(err.message);
      setGeneratedPrompt("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePrompt = () => {
    generatePrompt(startingTags());
  };

  const handleRetry = () => {
    // Append a random number to the prompt to force a new generation
    const newPromptInput = `${startingTags()}, random_seed_${Math.floor(Math.random() * 1000000)}`;
    generatePrompt(newPromptInput);
  };

  return (
    <div class="p-4">
      <h1 class="text-2xl font-bold mb-4">Prompt Flow Generator</h1>

      <div class="mb-4">
        <label for="startingTags" class="block text-sm font-medium text-gray-700 mb-1">
          Starting Tags:
        </label>
        <TextField>
          <TextFieldTextArea
            id="startingTags"
            placeholder="Enter starting tags, e.g., '1girl, solo, long hair'"
            value={startingTags()}
            onInput={(e: Event & { currentTarget: HTMLTextAreaElement }) => setStartingTags(e.currentTarget.value)}
            rows={5}
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
        <div class="bg-gray-100 p-4 rounded-md">
          <h2 class="text-lg font-semibold mb-2">Generated Prompt:</h2>
          <p class="whitespace-pre-wrap">{generatedPrompt()}</p>
        </div>
      )}
    </div>
  );
}
