import type { CivitaiModelWithRelations } from "~/backend/schema/models";
import type { Model } from "~/types/civitai";
import { Badge } from "./ui/badge";
import { modelTypeToSlang } from "~/utils/modelTypeToSlang";
import { modelBaseToSlang } from "~/utils/modelBaseToSlang";
import { Image } from "@unpic/solid";
import { blurhashToCssGradientString } from "@unpic/placeholder";

export interface ModelCardProps {
  model: CivitaiModelWithRelations | Model;
}

export const ModelCard = ({ model }: ModelCardProps) => {
  const placeholder = blurhashToCssGradientString(
    model.modelVersions?.[0]?.images?.[0]?.hash
  );

  return (
    <div class="w-full aspect-[2/3] border border-border rounded-md bg-card contain-paint">
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
      <div class="absolute bottom-1 left-1 flex gap-0.5 flex-col">
        {/* <img src={model.modelVersions?.at(0)?.}/> */}
      </div>
    </div>
  );
};
