import torch
from diffusers import StableDiffusionXLPipeline


MODEL_ID = "hf-internal-testing/tiny-stable-diffusion-xl-pipe"


def main() -> None:
    StableDiffusionXLPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
    )


if __name__ == "__main__":
    main()
