import torch
from diffusers import AutoencoderKL, StableDiffusionXLPipeline


def main() -> None:
    common_args = {
        "torch_dtype": torch.float16,
        "variant": "fp16",
        "use_safetensors": True,
    }

    AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix",
        torch_dtype=torch.float16,
    )
    StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        **common_args,
    )


if __name__ == "__main__":
    main()
