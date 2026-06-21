import type { CivitaiModelWithRelations } from "~/backend/schema/models";
import type { Model } from "~/types/civitai";
import { Badge } from "./ui/badge";
import { modelTypeToSlang } from "~/utils/modelTypeToSlang";
import { modelBaseToSlang } from "~/utils/modelBaseToSlang";
import { Image } from "@unpic/solid";
import { blurhashToCssGradientString } from "@unpic/placeholder";
import { createSignal, Match, Switch, type JSX, createMemo } from "solid-js";
import { ModelTypes } from "~/backend/types/models";
import { generationStore, removeTti, setCheckpoint, setLora, setTti } from "~/store/generation";
import { useStore } from "@tanstack/solid-store";
import { Button } from "./ui/button";
import { CaretDown, CaretUp } from "phosphor-solid";
import type { DOMElement } from "solid-js/jsx-runtime";
import { onLongPress } from "solidjs-use";
import { useNavigate } from "@tanstack/solid-router";
import { ModelInstallStatus } from "./model-install-status";
import { toast } from "solid-sonner";

export interface ModelCardProps {
  model: CivitaiModelWithRelations | Model;
  selectable?: boolean;
}

export const isModel = (data: CivitaiModelWithRelations | Model): data is Model => {
  return Object.keys(data).includes("sfwOnly");
};

export const ModelCard = ({ model, selectable = false }: ModelCardProps) => {
  const [target, setTarget] = createSignal<HTMLElement>();
  const [modelVersionIndex, setModelVersionIndex] = createSignal(0);

  const currentModelVersion = createMemo(() => {
    return model.modelVersions?.[modelVersionIndex()];
  });

  const placeholder = blurhashToCssGradientString(currentModelVersion()?.images?.[0]?.hash);
  const selectedCheckpoint = useStore(
    generationStore,
    (state) => state.checkpoint?.modelId === model.id,
  );
  const selectedLora = useStore(
    generationStore,
    (state) => state.lora?.find((lora) => lora.modelId === model.id) !== undefined,
  );
  const selectedTTI = useStore(generationStore, (state) =>
    state.textualInversions?.find((tti) => tti.modelId === model.id),
  );
  const navigate = useNavigate();
  const installStatus = () => (model as any).status as string | null | undefined;
  const installMessage = () => (model as any).statusMessage as string | null | undefined;
  const isReadyForGeneration = () => !selectable || installStatus() === "READY";

  const isSelected = () => {
    if (ModelTypes.Checkpoint === model.type) {
      return selectedCheckpoint();
    } else if (ModelTypes.LORA === model.type) {
      return selectedLora();
    } else if (ModelTypes.TextualInversion === model.type) {
      return selectedTTI() !== undefined;
    }
  };

  const selectableProps = {
    onClick() {
      if (!isReadyForGeneration()) {
        toast.error(installMessage() ?? "Model is not ready for generation yet.");
        return;
      }

      if (ModelTypes.Checkpoint === model.type) {
        setCheckpoint(model.id, currentModelVersion()!.id);
      } else if (ModelTypes.LORA === model.type) {
        setLora(model.id, currentModelVersion()!.id);
      } else if (ModelTypes.TextualInversion === model.type) {
        removeTti(model.id);
      }
    },
  } as JSX.HTMLAttributes<HTMLDivElement>;

  const handleTTIPress = (
    e: MouseEvent & {
      currentTarget: HTMLButtonElement;
      target: DOMElement;
    },
    type: "negative" | "positive",
  ) => {
    e.stopPropagation();
    if (!isReadyForGeneration()) {
      toast.error(installMessage() ?? "Model is not ready for generation yet.");
      return;
    }

    setTti(model.id, currentModelVersion()!.id, type);
  };

  onLongPress(target, (e) => {
    e.preventDefault();
    navigate({
      to: "/models/$id/$vId",
      params: {
        id: model.id.toString(),
        vId: (currentModelVersion()?.id ?? 0).toString(),
      },
    });
  });

  return (
    <div
      ref={setTarget}
      class="w-full aspect-[2/3] border border-border rounded-md bg-card contain-paint box-border"
      classList={{
        "opacity-80": selectable && !isSelected(),
        "cursor-not-allowed grayscale": selectable && !isReadyForGeneration(),
        "border-accent-foreground border-[3px] opacity-100": isSelected(),
      }}
      onClick={() => {
        navigate({
          to: "/models/$id/$vId",
          params: {
            id: model.id.toString(),
            vId: (currentModelVersion()?.id ?? 0).toString(),
          },
        });
      }}
      {...(selectable ? selectableProps : {})}
    >
      <Image
        class="w-full h-full object-cover"
        src={currentModelVersion()?.images?.[0]?.url}
        alt={currentModelVersion()?.name}
        layout="fullWidth"
        background={placeholder}
      />
      <div class="absolute top-1 left-1 flex gap-0.5">
        <Badge variant={"secondary"} class="rounded-r-none">
          {modelTypeToSlang(model.type)}
        </Badge>
        <Badge
          variant={"secondary"}
          class="rounded-l-none"
          onClick={(e) => {
            e.stopPropagation();
            setModelVersionIndex((prev) => (prev + 1) % (model.modelVersions?.length ?? 1));
          }}
        >
          {modelBaseToSlang(currentModelVersion()?.baseModel ?? "other")}
        </Badge>
      </div>
      <ModelInstallStatus
        status={installStatus()}
        message={installMessage()}
        showMessage
        class="absolute right-1 top-1 max-w-[calc(100%-0.5rem)] text-right"
        messageClass="block max-w-44 truncate rounded-sm bg-background/85 px-1 py-0.5 text-[11px] font-medium text-foreground shadow-sm"
      />
      <Switch>
        <Match when={selectable && ModelTypes.TextualInversion === model.type}>
          <div class="absolute bottom-1 left-1 flex gap-0.5 justify-between">
            <Button
              class="flex-grow size-6"
              size={"icon"}
              onClick={(e) => handleTTIPress(e, "negative")}
              disabled={selectedTTI()?.type === "negative" || !isReadyForGeneration()}
            >
              <CaretDown weight="bold" />
            </Button>
            <Button
              class="flex-grow size-6"
              size={"icon"}
              onClick={(e) => handleTTIPress(e, "positive")}
              disabled={selectedTTI()?.type === "positive" || !isReadyForGeneration()}
            >
              <CaretUp weight="bold" />
            </Button>
          </div>
        </Match>
        <Match when={!selectable}>
          <div class="absolute bottom-0 left-0 right-0 p-2 flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <Image
                src={model.creator?.image ?? ""}
                alt={""}
                layout="constrained"
                width={24}
                height={24}
                class="rounded-full"
              />
              <p class="text-sm text-background drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
                {model.creator?.username ?? "No Creator"}
              </p>
            </div>
            <p class="font-semibold text-background drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
              {model.name}
            </p>
          </div>
        </Match>
      </Switch>
    </div>
  );
};
