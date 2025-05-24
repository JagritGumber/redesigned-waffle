import type { CivitaiModelWithRelations } from "~/backend/schema/models";
import type { Model } from "~/types/civitai";
import { Badge } from "./ui/badge";
import { modelTypeToSlang } from "~/utils/modelTypeToSlang";
import { modelBaseToSlang } from "~/utils/modelBaseToSlang";
import { Image } from "@unpic/solid";
import { blurhashToCssGradientString } from "@unpic/placeholder";
import { createSignal, Match, Switch, type JSX } from "solid-js";
import { ModelTypes } from "~/backend/types/models";
import {
  generationStore,
  removeTti,
  setCheckpoint,
  setLora,
  setTti,
} from "~/store/generation";
import { useStore } from "@tanstack/solid-store";
import { Button } from "./ui/button";
import { CaretDown, CaretUp } from "phosphor-solid";
import type { DOMElement } from "solid-js/jsx-runtime";
import { onLongPress } from "solidjs-use";
import { useNavigate } from "@tanstack/solid-router";

export interface ModelCardProps {
  model: CivitaiModelWithRelations | Model;
  selectable?: boolean;
}

export const ModelCard = ({ model, selectable = false }: ModelCardProps) => {
  const [target, setTarget] = createSignal<HTMLElement>();

  const placeholder = blurhashToCssGradientString(
    model.modelVersions?.[0]?.images?.[0]?.hash
  );
  const selectedCheckpoint = useStore(
    generationStore,
    (state) => state.checkpoint?.modelId === model.id
  );
  const selectedLora = useStore(
    generationStore,
    (state) =>
      state.lora?.find((lora) => lora.modelId === model.id) !== undefined
  );
  const selectedTTI = useStore(generationStore, (state) =>
    state.textualInversions?.find((tti) => tti.modelId === model.id)
  );
  const navigate = useNavigate();

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
      if (ModelTypes.Checkpoint === model.type) {
        setCheckpoint(model.id, model.modelVersions.at(0)!.id);
      } else if (ModelTypes.LORA === model.type) {
        setLora(model.id, model.modelVersions.at(0)!.id);
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
    type: "negative" | "positive"
  ) => {
    e.stopPropagation();
    setTti(model.id, model.modelVersions.at(0)!.id, type);
  };

  onLongPress(target, (e) => {
    e.preventDefault();
    navigate({
      to: "/models/$id/$vId",
      params: {
        id: model.id.toString(),
        vId: (model.modelVersions?.at(0)?.id ?? 0).toString(),
      },
    });
  });

  return (
    <div
      ref={setTarget}
      class="w-full aspect-[2/3] border border-border rounded-md bg-card contain-paint box-border"
      classList={{
        "opacity-80": selectable && !isSelected(),
        "border-accent-foreground border-[3px] opacity-100": isSelected(),
      }}
      onClick={() => {
        navigate({
          to: "/models/$id/$vId",
          params: {
            id: model.id.toString(),
            vId: (model.modelVersions?.at(0)?.id ?? 0).toString(),
          },
        });
      }}
      {...(selectable ? selectableProps : {})}
    >
      <Image
        class="w-full h-full object-cover"
        src={model.modelVersions?.[0]?.images?.[0]?.url}
        alt={model.modelVersions?.[0]?.name}
        layout="fullWidth"
        background={placeholder}
      />
      <div class="absolute top-1 left-1 flex gap-0.5">
        <Badge variant={"secondary"} class="rounded-r-none">
          {modelTypeToSlang(model.type)}
        </Badge>
        <Badge variant={"secondary"} class="rounded-l-none">
          {modelBaseToSlang(model.modelVersions?.[0]?.baseModel ?? "other")}
        </Badge>
      </div>
      <div class="absolute bottom-1 left-1 flex gap-0.5 justify-between">
        <Switch>
          <Match
            when={selectable && ModelTypes.TextualInversion === model.type}
          >
            <Button
              class="flex-grow size-6"
              size={"icon"}
              onClick={(e) => handleTTIPress(e, "negative")}
              disabled={selectedTTI()?.type === "negative"}
            >
              <CaretDown weight="bold" />
            </Button>
            <Button
              class="flex-grow size-6"
              size={"icon"}
              onClick={(e) => handleTTIPress(e, "positive")}
              disabled={selectedTTI()?.type === "positive"}
            >
              <CaretUp weight="bold" />
            </Button>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
