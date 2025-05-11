import { createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { ModelList } from "~/components/model-list";
import useGenerationModels from "~/hooks/useGenerationModels";

export const Route = createFileRoute("/tabs/two")({
  component: RouteComponent,
});

function RouteComponent() {
  const ckQuery = useGenerationModels("checkpoints");
  const lrQuery = useGenerationModels("loras");
  const ttiQuery = useGenerationModels("textual-inversions");
  const hnQuery = useGenerationModels("hypernetworks");
  const agQuery = useGenerationModels("aesthetic-gradients");
  const cnQuery = useGenerationModels("controlnets");
  const psQuery = useGenerationModels("poses");

  return (
    <main class="flex flex-col gap-2 p-2">
      <Show when={(ckQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Checkpoint</h2>
        <ModelList query={ckQuery} class="p-0" />
      </Show>
      <Show when={(lrQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Lora(s)</h2>
        <ModelList query={lrQuery} class="p-0" />
      </Show>
      <Show when={(ttiQuery.data?.models?.length ?? 0) > 0}>
        <h2 class="text-lg font-semibold">Select Textual Inversion(s)</h2>
        <ModelList query={ttiQuery} class="p-0" />
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
    </main>
  );
}
