import base64
import io
import os

import runpod
import torch
from diffusers import (
    AutoencoderKL,
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    StableDiffusionXLPipeline,
)


PIPELINE = None


def load_pipeline():
    global PIPELINE
    if PIPELINE is not None:
        return PIPELINE

    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix",
        torch_dtype=torch.float16,
        local_files_only=True,
    )
    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        vae=vae,
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
        add_watermarker=False,
        local_files_only=True,
    ).to("cuda")

    pipe.enable_xformers_memory_efficient_attention()
    pipe.enable_model_cpu_offload()
    PIPELINE = pipe
    return PIPELINE


def image_to_base64(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def build_prompt(inference_request):
    raw_prompt = (inference_request or {}).get("prompt", "")
    tokens = [
        token.strip()
        for token in raw_prompt.split(",")
        if token.strip() and token.strip().lower() != "undefined"
    ]
    additions = [
        "safe-for-work",
        "studio lighting",
        "clean composition",
        "high detail",
    ]
    generated = ", ".join(dict.fromkeys([*tokens, *additions]))
    return {"generated_prompt": generated}


def as_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_float(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@torch.inference_mode()
def generate_image(inference_request):
    pipe = load_pipeline()
    data = inference_request or {}

    seed = data.get("seed")
    if seed is None:
        seed = int.from_bytes(os.urandom(2), "big")
    seed = as_int(seed, 0)

    scheduler_name = data.get("scheduler") or data.get("sampler_name")
    if scheduler_name in {"Euler a", "K_EULER_ANCESTRAL"}:
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    elif scheduler_name in {"Euler", "K_EULER"}:
        pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config)

    generator = torch.Generator("cuda").manual_seed(seed)
    result = pipe(
        prompt=data.get("prompt", ""),
        negative_prompt=data.get("negative_prompt"),
        width=as_int(data.get("width"), 1024),
        height=as_int(data.get("height"), 1024),
        num_inference_steps=as_int(
            data.get("num_inference_steps", data.get("steps")),
            25,
        ),
        guidance_scale=as_float(
            data.get("guidance_scale", data.get("cfg_scale")),
            7.5,
        ),
        num_images_per_prompt=as_int(data.get("num_images", data.get("batch_size")), 1),
        generator=generator,
    )

    images = [image_to_base64(image) for image in result.images]
    return {"images": images, "seed": seed}


def handler(event):
    job_input = event.get("input") or {}
    job_type = job_input.get("job_type", "generate_image")
    request_data = job_input.get("data", job_input)

    if job_type == "generate_image":
        result = generate_image(request_data)
    elif job_type == "generate_prompt":
        result = build_prompt(request_data)
    else:
        raise ValueError(f"Unknown job_type: {job_type}")

    return result


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
