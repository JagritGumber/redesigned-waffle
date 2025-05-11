import type { SelectGeneratorJob } from "~/backend/schema";
import { Image } from "@unpic/solid";

export interface ImageCardProps {
  image: SelectGeneratorJob;
}

export const ImageCard = ({ image }: ImageCardProps) => {
  return (
    <div class="w-full aspect-square border border-border rounded-md bg-card contain-paint">
      <Image
        class="w-full h-full object-cover"
        src={`${import.meta.env.VITE_BACKEND_URL}/api/v1/images/${encodeURIComponent(image.imageKey ?? "")}`}
        alt={image.imageKey ?? ""}
        layout="fullWidth"
        background="auto"
      />
    </div>
  );
};
