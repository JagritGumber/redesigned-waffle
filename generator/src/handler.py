"""Generator worker file that loads base models, LoRAs, and Textual Inversions from /runpod-volume."""

from PIL import (
    Image,
)
from runpod import RunPodLogger
import runpod


from diffusers.pipelines.stable_diffusion_xl.pipeline_stable_diffusion_xl import (
    StableDiffusionXLPipeline,
)
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion import (
    StableDiffusionPipeline,
)
from diffusers.pipelines.pipeline_utils import DiffusionPipeline
import torch
import base64
import io
import time
import os
import typing as t
from pydantic import (
    BaseModel,
    Field,
    field_validator,
)
from safetensors.torch import load_file

log = RunPodLogger()

BASE_SDXL_PATH = "/defaults/stable-diffusion-xl-base-1.0"
BASE_SD15_PATH = "/defaults/stable-diffusion-v1-5"


class LoRAItem(BaseModel):
    """Defines a single LoRA to be applied."""

    local_path: str
    weight: float = 1.0

    @field_validator("local_path")
    def check_path_starts_with_volume_and_exists(cls, v):

        if not v.startswith("/runpod-volume/") and not v.startswith("/defaults/"):
            raise ValueError("Local path must start with /runpod-volume/ or /defaults/")

        if not os.path.exists(v):
            raise FileNotFoundError(f"File or directory not found at path: {v}")
        return v


class TIItem(BaseModel):
    """Defines a single Textual Inversion (Embedding) to be applied."""

    local_path: str

    @field_validator("local_path")
    def check_path_starts_with_volume_and_exists(cls, v):

        if not v.startswith("/runpod-volume/") and not v.startswith("/defaults/"):
            raise ValueError("Local path must start with /runpod-volume/ or /defaults/")

        if not os.path.exists(v):
            raise FileNotFoundError(f"File or directory not found at path: {v}")
        return v


class ModelConfig(BaseModel):
    """Defines the base model configuration for the generator."""

    local_path: str

    model_type: t.Literal["SDXL 1.0", "SD 1.5", "Illustrious", "Pony"]

    @field_validator("local_path")
    def check_path_starts_with_volume_and_exists(cls, v):

        if not v.startswith("/runpod-volume/") and not v.startswith("/defaults/"):
            raise ValueError("Local path must start with /runpod-volume/ or /defaults/")

        if not os.path.exists(v):
            raise FileNotFoundError(f"Model path not found: {v}")

        return v


class GeneratorArgs(BaseModel):
    """Arguments for the generation process."""

    num_inference_steps: int = 25
    guidance_scale: float = 7.0

    height: t.Optional[int] = None
    width: t.Optional[int] = None
    negative_prompt: t.Optional[str] = None


class GeneratorInputPayload(BaseModel):
    """Main input payload for the generator worker."""

    prompt: str
    model_conf: ModelConfig
    loras: t.Optional[t.List[LoRAItem]] = Field(default_factory=list)
    textual_inversions: t.Optional[t.List[TIItem]] = Field(default_factory=list)
    generator_args: t.Optional[GeneratorArgs] = Field(default_factory=GeneratorArgs)


_cached_pipeline = None
_cached_base_path = None
_cached_model_type = None
_cached_model_device = None


def clear_pipeline_addons(pipe):
    """Clears loaded LoRAs and potentially TIs (if unload methods existed) from a pipeline."""
    log.debug("Clearing pipeline addons (LoRAs)...")

    if hasattr(pipe, "disable_adapters"):
        pipe.disable_adapters()
        log.debug("Disabled adapters.")


def handler(job: t.Dict) -> t.Dict:
    """
    Handles the job by loading a base model, LoRAs, and Textual Inversions from /runpod-volume and generating an image.
    Always returns a dictionary with 'status', 'message', and optionally 'result'.
    """
    global _cached_pipeline, _cached_base_path, _cached_model_type, _cached_model_device

    job_id = job.get("id", "N/A")
    log.info(f"Processing job ID: {job_id}")

    response_data: t.Dict = {
        "status": "FAILED",
        "message": "An unknown error occurred.",
    }

    pipe = None
    device = "cuda" if torch.cuda.is_available() else "cpu"

    try:
        job_input = GeneratorInputPayload(**job.get("input", {}))
        prompt = job_input.prompt
        model_config = job_input.model_conf
        loras_to_apply = job_input.loras or []
        tis_to_apply = job_input.textual_inversions or []
        generator_args = job_input.generator_args or GeneratorArgs()

        requested_model_path = model_config.local_path
        model_type = model_config.model_type

        log.info(f"Job requested Model: Type={model_type}, Path={requested_model_path}")
        log.info(
            f"Job requested {len(loras_to_apply)} LoRAs and {len(tis_to_apply)} Textual Inversions."
        )

        if model_type in ["SDXL 1.0", "Illustrious", "Pony"]:
            required_base_path = BASE_SDXL_PATH
            pipeline_class = StableDiffusionXLPipeline
        elif model_type == "SD 1.5":
            required_base_path = BASE_SD15_PATH
            pipeline_class = StableDiffusionPipeline
        else:
            response_data["message"] = (
                f"Unsupported base model_type specified: {model_type}"
            )
            log.error(response_data["message"])
            return response_data

        is_base_cached_hit = False

        if (
            _cached_pipeline is not None
            and _cached_base_path == required_base_path
            and _cached_model_type == model_type
            and _cached_model_device == device
        ):
            log.info(
                f"Using cached base pipeline {model_type} from {required_base_path}"
            )
            pipe = _cached_pipeline
            is_base_cached_hit = True
        else:
            log.info(
                f"Loading base pipeline from {required_base_path} for type {model_type}"
            )

            if not os.path.isdir(required_base_path):
                log.error(
                    f"Required base model directory not found: {required_base_path}"
                )
                response_data["message"] = (
                    f"Base model files for {model_type} not found at {required_base_path}. Please ensure the standard base model is downloaded."
                )
                return response_data

            try:
                log.info(
                    f"Attempting to load base pipeline from directory: {required_base_path}"
                )
                pipe = pipeline_class.from_pretrained(
                    required_base_path,
                    torch_dtype=(torch.float16 if device == "cuda" else torch.float32),
                    local_files_only=True,
                    variant=(
                        "fp16" if device == "cuda" and model_type != "SD 1.5" else None
                    ),
                )
                pipe.to(device)

                _cached_pipeline = pipe
                _cached_base_path = required_base_path
                _cached_model_type = model_type
                _cached_model_device = device
                log.info(
                    f"Base pipeline type {model_type} loaded successfully from {required_base_path}."
                )

            except Exception as load_error:
                log.error(
                    f"Error loading base pipeline from {required_base_path} (Type: {model_type}): {load_error}",
                )

                _cached_pipeline = None
                _cached_base_path = None
                _cached_model_type = None
                _cached_model_device = None
                response_data["message"] = (
                    f"Failed to load base pipeline from {required_base_path} (Type: {model_type}): {load_error}"
                )
                return response_data

        if pipe is None:
            log.error("Pipeline object is None after base loading logic.")
            response_data["message"] = (
                "Internal error: Base Pipeline failed to initialize."
            )
            return response_data

        clear_pipeline_addons(pipe)

        is_checkpoint_loaded = False
        checkpoint_path_loaded = None

        if os.path.isfile(requested_model_path):
            log.info(
                f"Requested model path {requested_model_path} is a file. Attempting to load as checkpoint weights."
            )
            checkpoint_path_loaded = requested_model_path
            try:

                checkpoint_weights = load_file(requested_model_path)

                log.debug(
                    "Attempting to load checkpoint state dict into pipeline components..."
                )
                try:
                    pipe.load_state_dict(checkpoint_weights, strict=False)
                    log.info(
                        f"Successfully loaded checkpoint weights from {requested_model_path} into the pipeline."
                    )
                    is_checkpoint_loaded = True
                except Exception as full_load_error:
                    log.error(
                        f"Failed to load checkpoint state dict into pipeline: {full_load_error}"
                    )

                    raise ValueError(
                        f"Could not apply checkpoint weights from {requested_model_path}"
                    )

            except Exception as checkpoint_load_error:
                log.error(
                    f"Error loading or applying checkpoint weights from {requested_model_path}: {checkpoint_load_error}"
                )

                del pipe
                pipe = None

                _cached_pipeline = None
                _cached_base_path = None
                _cached_model_type = None
                _cached_model_device = None

                response_data["message"] = (
                    f"Failed to load or apply custom checkpoint weights from {requested_model_path}: {checkpoint_load_error}"
                )
                return response_data

        elif os.path.isdir(requested_model_path):

            if requested_model_path != required_base_path:
                log.warn(
                    f"Requested model path {requested_model_path} is a directory but not the standard base path {required_base_path}. Using the standard base pipeline. Checkpoint loading from a file will be skipped."
                )

        else:

            log.error(
                f"Requested model path {requested_model_path} is neither a file nor a directory. This should not occur based on validation."
            )
            response_data["message"] = (
                f"Invalid model path specified: {requested_model_path}. Path is not a file or directory."
            )
            return response_data

        if loras_to_apply:
            log.info(f"Loading and applying {len(loras_to_apply)} LoRAs...")
            adapter_names = []
            adapter_weights = []
            lora_errors = []

            for i, lora_item in enumerate(loras_to_apply):
                lora_name = f"lora_{i}"

                adapter_names.append(lora_name)
                adapter_weights.append(lora_item.weight)
                try:
                    log.debug(
                        f"Loading LoRA: {lora_item.local_path} with weight {lora_item.weight}"
                    )

                    if not os.path.isfile(lora_item.local_path):
                        raise FileNotFoundError(
                            f"LoRA path is not a file: {lora_item.local_path}"
                        )

                    pipe.load_lora_weights(
                        lora_item.local_path,
                        adapter_name=lora_name,
                        local_files_only=True,
                    )
                    log.debug(
                        f"Successfully loaded LoRA {lora_item.local_path} as adapter '{lora_name}'"
                    )

                except Exception as lora_load_error:
                    log.error(
                        f"Error loading LoRA {lora_item.local_path}: {lora_load_error}",
                    )
                    lora_errors.append(
                        {"path": lora_item.local_path, "error": str(lora_load_error)}
                    )

            if lora_errors:

                clear_pipeline_addons(pipe)
                response_data["message"] = "Failed to load one or more LoRA files."
                response_data["lora_errors"] = lora_errors
                return response_data

            try:

                pipe.set_adapters(adapter_names)
                pipe.set_adapters_weights(adapter_names, adapter_weights)
                log.info(f"Set {len(adapter_names)} LoRA adapters with weights.")
            except Exception as set_adapter_error:
                log.error(f"Error setting LoRA adapters: {set_adapter_error}")
                clear_pipeline_addons(pipe)
                response_data["message"] = (
                    f"Failed to set LoRA adapters: {set_adapter_error}"
                )
                return response_data

        loaded_ti_tokens = []
        if tis_to_apply:
            log.info(f"Loading {len(tis_to_apply)} Textual Inversions...")
            ti_errors = []

            for ti_item in tis_to_apply:
                try:
                    log.debug(f"Loading Textual Inversion: {ti_item.local_path}")

                    if not os.path.isfile(ti_item.local_path):
                        raise FileNotFoundError(
                            f"TI path is not a file: {ti_item.local_path}"
                        )

                    token = pipe.load_textual_inversion(
                        ti_item.local_path, local_files_only=True
                    )
                    log.debug(
                        f"Successfully loaded TI {ti_item.local_path}, token: '{token}'"
                    )
                    loaded_ti_tokens.append(
                        {"path": ti_item.local_path, "token": token}
                    )

                except Exception as ti_load_error:
                    log.error(
                        f"Error loading Textual Inversion {ti_item.local_path}: {ti_load_error}",
                    )
                    ti_errors.append(
                        {"path": ti_item.local_path, "error": str(ti_load_error)}
                    )

            if ti_errors:

                response_data["message"] = (
                    "Failed to load one or more Textual Inversion files."
                )
                response_data["ti_errors"] = ti_errors

                return response_data

        log.info(
            f"Starting image generation for prompt: '{prompt[:50]}...' using base model at {required_base_path} and checkpoint {checkpoint_path_loaded if checkpoint_path_loaded else 'None'} (Type: {model_type})"
        )
        time_start = time.time()

        gen_args_dict = generator_args.model_dump(exclude_none=True)
        gen_args_dict["prompt"] = prompt

        try:

            output = pipe(**gen_args_dict)

            image = None
            if (
                hasattr(output, "images")
                and isinstance(output.images, list)
                and len(output.images) > 0
            ):
                image = output.images[0]
                log.debug("Accessed image from pipeline output .images list.")
            elif (
                isinstance(output, tuple)
                and len(output) > 0
                and hasattr(output[0], "save")
            ):
                image = output[0]
                log.debug("Accessed image from pipeline output tuple.")
            elif hasattr(output, "save"):
                image = output
                log.debug("Accessed image directly from pipeline output object.")
            else:
                log.error("Pipeline output does not contain a recognized image format.")

                log.error(f"Pipeline output type: {type(output)}")
                if isinstance(output, (list, tuple)) and len(output) > 0:
                    log.error(f"First item in output type: {type(output[0])}")

                raise RuntimeError("Pipeline did not return a valid image.")

        except Exception as gen_error:
            log.error(f"Error during image generation: {gen_error}")

            if "out of memory" in str(gen_error).lower() or (
                hasattr(gen_error, "message")
                and "out of memory" in str(gen_error.message).lower()
            ):
                log.warn("Attempting to clear CUDA cache due to potential OOM.")

                del pipe
                pipe = None
                _cached_pipeline = None
                _cached_base_path = None
                _cached_model_type = None
                _cached_model_device = None
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                log.warn("CUDA cache emptied.")

                response_data["message"] = (
                    f"Error during image generation: {gen_error} (Potential Out of Memory. Model cache cleared.)"
                )
            else:
                response_data["message"] = f"Error during image generation: {gen_error}"

            if pipe is not None:
                try:
                    clear_pipeline_addons(pipe)
                except Exception as cleanup_error:
                    log.error(
                        f"Error during cleanup after generation error: {cleanup_error}"
                    )

            return response_data

        time_taken = time.time() - time_start
        log.info(f"Image generation completed in {time_taken:.4f} seconds.")

        buffer = io.BytesIO()
        try:
            image.save(buffer, format="PNG")
            image_bytes = buffer.getvalue()
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
            log.debug("Image successfully processed and base64 encoded.")
        except Exception as img_process_error:
            log.error(f"Error processing generated image: {img_process_error}")
            response_data["message"] = (
                f"Error processing generated image: {img_process_error}"
            )

            if pipe is not None:
                try:
                    clear_pipeline_addons(pipe)
                except Exception as cleanup_error:
                    log.error(
                        f"Error during cleanup after image process error: {cleanup_error}"
                    )
            return response_data

        if pipe is not None:
            clear_pipeline_addons(pipe)

        response_data["status"] = "COMPLETED"
        response_data["message"] = "Image generation completed successfully."
        response_data["result"] = {
            "image": base64_image,
            "time_taken": time_taken,
            "base_model_path_loaded": required_base_path,
            "checkpoint_path_loaded": checkpoint_path_loaded,
            "model_type_used": model_type,
            "loras_applied": [lora.local_path for lora in loras_to_apply],
            "tis_applied": [ti.local_path for ti in tis_to_apply],
            "cached_base_model_used": is_base_cached_hit,
            "loaded_ti_tokens": loaded_ti_tokens if tis_to_apply else None,
        }
        log.info(f"Job ID {job_id} completed successfully.")
        return response_data

    except Exception as e:

        log.error(
            f"An unhandled error occurred during job processing for Job ID {job_id}: {e}",
        )

        if "pipe" in locals() and pipe is not None:
            try:
                clear_pipeline_addons(pipe)
            except Exception as cleanup_error:
                log.error(
                    f"Error during cleanup after job error: {cleanup_error}",
                )
            del pipe
            pipe = None

        _cached_pipeline = None
        _cached_base_path = None
        _cached_model_type = None
        _cached_model_device = None

        response_data["status"] = "FAILED"
        response_data["message"] = f"An unexpected error occurred: {str(e)}"

        log.info(f"Job ID {job_id} failed with unexpected error.")
        return response_data


log.info("Starting generator worker...")

runpod.serverless.start({"handler": handler})
