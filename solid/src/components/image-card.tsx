import type { SelectGeneratorJob } from "~/backend/schema";
import { Image } from "@unpic/solid";
import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { cn } from "~/lib/utils";
export interface ImageCardProps {
  image: SelectGeneratorJob;
  isProcessing?: boolean; // Add isProcessing prop
}

export const ImageCard = ({ image, isProcessing }: ImageCardProps) => {
  return (
    <>
      <Link to="/gallery/$id" params={{ id: image.id }}>
        <div
          class={cn(
            "w-full aspect-square border border-border rounded-md bg-card contain-paint",
            isProcessing && "flex items-center justify-center bg-card", // Add processing styles
          )}
        >
          <Show
            when={!isProcessing}
            fallback={
              <div class="flex flex-col items-center justify-center text-card-foreground">
                <span class="mt-2 text-sm">Processing...</span>
              </div>
            }
          >
            <Image
              class="w-full h-full object-cover"
              src={`${import.meta.env.VITE_BACKEND_URL}/api/v1/images/${encodeURIComponent(image.imageKey?.slice(image.imageKey.indexOf("generator")) ?? "")}`}
              alt={image.imageKey?.slice(image.imageKey.indexOf("generator")) ?? ""}
              layout="fullWidth"
              background="auto"
            />
          </Show>
        </div>
      </Link>
    </>
  );
};
