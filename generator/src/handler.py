"""Generator worker file that loads base models, LoRAs, and Textual Inversions from /runpod-volume."""

from PIL import Image
from runpod import RunPodLogger
import runpod

# from diffusers.pipelines.auto_pipeline import AutoPipelineForText2Image
from diffusers.pipelines.stable_diffusion_xl.pipeline_stable_diffusion_xl import (
    StableDiffusionXLPipeline,
)
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion import (
    StableDiffusionPipeline,
)
import torch
import base64
import io
import time
import os
import typing as t
from pydantic import BaseModel, Field, field_validator

log = RunPodLogger()


class LoRAItem(BaseModel):
    """Defines a single LoRA to be applied."""

    local_path: str  # Absolute path within the worker, e.g., "/runpod-volume/loras/my_lora.safetensors"
    weight: float = 1.0  # Weight/strength to apply the LoRA

    # Optional validator to ensure local_path is within /runpod-volume for safety
    @field_validator("local_path")
    def check_path_starts_with_volume(cls, v):
        if not v.startswith("/runpod-volume/"):
            raise ValueError("LoRA local_path must start with /runpod-volume/")
        return v


class TIItem(BaseModel):
    """Defines a single Textual Inversion (Embedding) to be applied."""

    local_path: str  # Absolute path within the worker, e.g., "/runpod-volume/embeddings/my_embedding.pt"
    # Note: Textual Inversions don't use a weight parameter directly in the same way LoRAs do.
    # Their strength is typically controlled by the user including the token in the prompt (e.g., (token:1.2)).

    # Optional validator to ensure local_path is within /runpod-volume for safety
    @field_validator("local_path")
    def check_path_starts_with_volume(cls, v):
        if not v.startswith("/runpod-volume/"):
            raise ValueError("TI local_path must start with /runpod-volume/")
        return v


class ModelConfig(BaseModel):
    """Defines the base model configuration for the generator."""

    local_path: str  # Directory where the base model is expected to be loaded from, e.g., "/runpod-volume/my_custom_model"
    model_type: t.Literal["SDXL", "SD15", "Illustrious"]  # Added model type hint
    # weight: float # Removed - this weight is not typically used for the *base* model when applying LoRAs/TIs
    # Use LoRAItem.weight for LoRA strength

    # Optional validator to ensure local_path is within /runpod-volume for safety
    @field_validator("local_path")
    def check_path_starts_with_volume(cls, v):
        if not v.startswith("/runpod-volume/"):
            raise ValueError("Base model local_path must start with /runpod-volume/")
        return v


class GeneratorArgs(BaseModel):
    """Arguments for the generation process."""

    num_inference_steps: int = (
        25  # Default for SD15/SDXL, adjust for SDXL-Turbo default if needed
    )
    guidance_scale: float = (
        7.0  # Default for SD15/SDXL, adjust for SDXL-Turbo default if needed
    )
    # Add other relevant args like height, width, negative_prompt, etc.
    height: t.Optional[int] = None
    width: t.Optional[int] = None
    negative_prompt: t.Optional[str] = None
    # Add any other args your diffusers pipeline supports and you want to control


class GeneratorInputPayload(BaseModel):
    """Main input payload for the generator worker."""

    prompt: str
    model_conf: ModelConfig
    loras: t.Optional[t.List[LoRAItem]] = Field(
        default_factory=list
    )  # List of LoRAs to apply
    textual_inversions: t.Optional[t.List[TIItem]] = Field(
        default_factory=list
    )  # List of TIs to apply
    generator_args: t.Optional[GeneratorArgs] = Field(
        default_factory=GeneratorArgs
    )  # Use default GeneratorArgs if none provided


# --- Global Model Cache (Optional but recommended for performance) ---
# Cache the base pipeline. LoRAs and TIs will be loaded/applied per job.
# Storing LoRAs/TIs in the cache is complex due to varying combinations.
# A simple cache stores only the base model.
_cached_pipeline = None
_cached_model_path = None
_cached_model_type = None
_cached_model_device = None


# --- Helper to clear LoRAs and TIs from a pipeline ---
# This is needed when reusing a cached pipeline for a new job
def clear_pipeline_addons(pipe):
    """Clears loaded LoRAs and potentially TIs (if unload methods existed) from a pipeline."""
    log.debug("Clearing pipeline addons (LoRAs)...")
    # Clear LoRAs
    # pipe.unload_lora_weights() # This might remove them completely
    # A safer approach is to disable adapters but leave them loaded if memory allows,
    # or call disable and then set the specific ones needed. Let's disable all first.
    if hasattr(pipe, "disable_adapters"):
        pipe.disable_adapters()
        # Note: disable_adapters doesn't remove the tensors from VRAM, just deactivates them.
        # For true VRAM release, unload_lora_weights() is needed, but it might be slow.
        # Let's stick to disable_adapters for speed when switching LoRAs on a cached base model.
    log.debug("Disabled adapters.")

    # Clearing Textual Inversions is harder. diffusers doesn't have a standard unload_textual_inversion.
    # TIs loaded via load_textual_inversion modify the tokenizer and text_encoder.
    # They persist on the pipeline instance.
    # For simplicity in this example, we won't attempt to unload TIs explicitly.
    # If the base model is reloaded (cache miss), TIs are naturally cleared.
    # If using a cached base model, new TIs are added, potentially growing the tokenizer/encoder.
    # This is a common limitation when dynamically loading TIs without pipeline recreation.
    # log.debug("Explicit Textual Inversion clearing is not standard in diffusers.")


# --- Generator Handler ---


def handler(job: t.Dict) -> t.Dict:
    """
    Handles the job by loading a base model, LoRAs, and Textual Inversions from /runpod-volume and generating an image.
    """
    global _cached_pipeline, _cached_model_path, _cached_model_type, _cached_model_device  # Use the global cache

    job_id = job.get("id", "N/A")
    log.info(f"Processing job ID: {job_id}")

    try:
        # Parse input using Pydantic
        job_input = GeneratorInputPayload(**job.get("input", {}))
        prompt = job_input.prompt
        model_config = job_input.model_conf
        loras_to_apply = job_input.loras or []  # Ensure it's a list
        tis_to_apply = job_input.textual_inversions or []  # Ensure it's a list
        generator_args = (
            job_input.generator_args or GeneratorArgs()
        )  # Ensure generator_args is not None

        local_model_path = model_config.local_path
        model_type = model_config.model_type
        device = (
            "cuda" if torch.cuda.is_available() else "cpu"
        )  # Assuming GPU worker for CUDA

        log.info(
            f"Job requested Base Model: Type={model_type}, Path={local_model_path}"
        )
        log.info(
            f"Job requested {len(loras_to_apply)} LoRAs and {len(tis_to_apply)} Textual Inversions."
        )

        pipe = None  # Initialize pipe variable

        # --- Base Model Loading Logic ---
        is_cached_hit = False
        # Check if the requested base model (by path and type) is already in the cache on the correct device
        if (
            _cached_pipeline is not None
            and _cached_model_path == local_model_path
            and _cached_model_type == model_type  # Check model type in cache key
            and _cached_model_device == device
        ):
            log.info(f"Using cached base model {model_type} from {local_model_path}")
            pipe = _cached_pipeline
            is_cached_hit = True
        else:
            log.info(
                f"Checking base model presence at {local_model_path} for type {model_type}"
            )
            # Check if the model directory exists and is not empty
            if os.path.isdir(local_model_path) and os.listdir(local_model_path):
                log.info(
                    f"Base model directory {local_model_path} found and is not empty. Loading..."
                )
                try:
                    # Choose pipeline class based on model_type hint
                    # Use from_pretrained with local_path
                    if model_type == "SD15":
                        pipe = StableDiffusionPipeline.from_pretrained(
                            local_model_path,
                            torch_dtype=(
                                torch.float16 if device == "cuda" else torch.float32
                            ),
                            local_files_only=True,  # Load only from the local path
                        )
                        log.info("Loaded using StableDiffusionPipeline.")
                    elif model_type in ["SDXL", "Illustrious"]:
                        pipe = StableDiffusionXLPipeline.from_pretrained(  # Using StableDiffusionXLPipeline is more specific than Auto
                            local_model_path,
                            torch_dtype=(
                                torch.float16 if device == "cuda" else torch.float32
                            ),
                            variant=(
                                "fp16" if device == "cuda" else None
                            ),  # variant is more common for XL pipelines
                            local_files_only=True,  # Load only from the local path
                        )
                        log.info(
                            "Loaded using StableDiffusionXLPipeline (for XL types)."
                        )
                    else:
                        # Should not happen due to Literal type hint in Pydantic, but as fallback
                        raise ValueError(
                            f"Unsupported base model_type specified: {model_type}"
                        )

                    pipe.to(device)
                    # Cache the newly loaded base pipeline
                    _cached_pipeline = pipe
                    _cached_model_path = local_model_path
                    _cached_model_type = model_type
                    _cached_model_device = device
                    log.info(
                        f"Base model type {model_type} loaded successfully from {local_model_path}."
                    )

                except Exception as load_error:
                    log.error(
                        f"Error loading base model from {local_model_path} (Type: {model_type}): {load_error}"
                    )
                    # Clean cache entries if loading fails for safety
                    _cached_pipeline = None
                    _cached_model_path = None
                    _cached_model_type = None
                    _cached_model_device = None
                    return {
                        "status": "FAILED",
                        "message": f"Failed to load base model from {local_model_path} (Type: {model_type}): {load_error}",
                    }
            else:
                log.error(
                    f"Base model directory {local_model_path} not found or is empty. Model not available for type {model_type}."
                )
                return {
                    "status": "FAILED",
                    "message": f"Base model files not found at {local_model_path}. Please ensure they have been downloaded for model type {model_type}.",
                }

        # --- Apply LoRAs and Textual Inversions ---
        if pipe is None:
            raise RuntimeError(
                "Pipeline was not loaded or cached."
            )  # Should not happen if logic is correct

        # Always clear previous LoRA adapter settings before applying new ones
        # This is crucial if reusing a cached pipeline with different LoRAs
        clear_pipeline_addons(pipe)

        # Load and set LoRAs
        if loras_to_apply:
            log.info(f"Loading and applying {len(loras_to_apply)} LoRAs...")
            adapter_names = []
            adapter_weights = []
            lora_errors = []

            for i, lora_item in enumerate(loras_to_apply):
                lora_name = f"lora_{i}"  # Assign a unique name for internal tracking
                adapter_names.append(lora_name)
                adapter_weights.append(lora_item.weight)
                try:
                    if not os.path.exists(lora_item.local_path):
                        raise FileNotFoundError(
                            f"LoRA file not found: {lora_item.local_path}"
                        )

                    log.debug(
                        f"Loading LoRA: {lora_item.local_path} with weight {lora_item.weight}"
                    )
                    # load_lora_weights can take a path or a hub ID
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
                        f"Error loading LoRA {lora_item.local_path}: {lora_load_error}"
                    )
                    lora_errors.append(
                        {"path": lora_item.local_path, "error": str(lora_load_error)}
                    )
                    # Optionally, remove the name and weight from the lists if loading failed?
                    # Or proceed with partial LoRAs? Let's fail the job if any LoRA fails to load.
                    # If you prefer partial success, handle error reporting and continue.
                    # For simplicity, we'll raise an exception after iterating.

            if lora_errors:
                # Clean cache entries if loading fails? Might be too aggressive.
                # The base pipeline is still valid. Just report the error.
                return {
                    "status": "FAILED",
                    "message": "Failed to load one or more LoRA files.",
                    "lora_errors": lora_errors,
                }

            # After loading all, set the adapters and their weights for the *next* generation call
            try:
                # If using set_adapters_weights, the adapter names must already be loaded by load_lora_weights
                pipe.set_adapters(adapter_names)  # Activate the loaded adapters
                pipe.set_adapters_weights(
                    adapter_names, adapter_weights
                )  # Set their specific weights
                log.info(f"Set {len(adapter_names)} LoRA adapters with weights.")
            except Exception as set_adapter_error:
                log.error(f"Error setting LoRA adapters: {set_adapter_error}")
                # Clear adapters and fail
                clear_pipeline_addons(pipe)  # Ensure nothing is left active
                return {
                    "status": "FAILED",
                    "message": f"Failed to set LoRA adapters: {set_adapter_error}",
                }

        # Load Textual Inversions
        loaded_ti_tokens = []  # Keep track of loaded TI tokens
        if tis_to_apply:
            log.info(f"Loading {len(tis_to_apply)} Textual Inversions...")
            ti_errors = []

            for ti_item in tis_to_apply:
                try:
                    if not os.path.exists(ti_item.local_path):
                        raise FileNotFoundError(
                            f"TI file not found: {ti_item.local_path}"
                        )

                    log.debug(f"Loading Textual Inversion: {ti_item.local_path}")
                    # load_textual_inversion returns the token added to the tokenizer
                    # For TIs, the user *must* include this token in the prompt.
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
                        f"Error loading Textual Inversion {ti_item.local_path}: {ti_load_error}"
                    )
                    ti_errors.append(
                        {"path": ti_item.local_path, "error": str(ti_load_error)}
                    )
                    # Fail the job if any TI fails to load.

            if ti_errors:
                # TIs modify the pipeline state (tokenizer/text_encoder).
                # It's hard to undo this cleanly without reloading the base pipeline.
                # Let's fail the job and rely on cache invalidation on the next job if needed.
                return {
                    "status": "FAILED",
                    "message": "Failed to load one or more Textual Inversion files.",
                    "ti_errors": ti_errors,
                }

        # --- Image Generation ---
        log.info(
            f"Starting image generation for prompt: '{prompt[:50]}...' using model at {local_model_path} (Type: {model_type})"
        )
        time_start = time.time()

        # Prepare generator arguments, excluding None values
        gen_args_dict = generator_args.model_dump(exclude_none=True)
        # Ensure required args for the specific pipeline are present, e.g., prompt
        gen_args_dict["prompt"] = prompt

        # Pass height, width, negative_prompt explicitly if provided
        # These were already handled in the previous version, keep them.
        if generator_args.height is not None:
            gen_args_dict["height"] = generator_args.height
        if generator_args.width is not None:
            gen_args_dict["width"] = generator_args.width
        if generator_args.negative_prompt is not None:
            gen_args_dict["negative_prompt"] = generator_args.negative_prompt

        # Call the pipeline with the parsed arguments
        try:
            # Generation happens here with the base model, loaded LoRAs (activated by set_adapters),
            # and loaded TIs (used via their tokens in the prompt).
            image = pipe(**gen_args_dict)[0]

        except Exception as gen_error:
            log.error(f"Error during image generation: {gen_error}")
            # Attempt to free memory if OOM is suspected
            if "out of memory" in str(gen_error).lower():
                log.warn("Attempting to clear CUDA cache due to potential OOM.")
                torch.cuda.empty_cache()
                # Consider unloading the model/LoRAs here if OOM is persistent?
                # If OOM happens during generation *after* loading LoRAs/TIs,
                # it's likely due to VRAM pressure from the combined models.
                # Clearing the cache (setting _cached_pipeline = None) might be necessary
                # to force a full reload/cleanup on the next job.
                _cached_pipeline = None
                _cached_model_path = None
                _cached_model_type = None
                _cached_model_device = None

            # Ensure adapters are disabled after generation attempt, even if failed
            clear_pipeline_addons(pipe)

            return {
                "status": "FAILED",
                "message": f"Error during image generation: {gen_error}",
            }

        time_taken = time.time() - time_start
        log.info(f"Image generation completed in {time_taken:.4f} seconds.")

        # --- Post-processing and Return ---
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()
        base64_image = base64.b64encode(image_bytes).decode("utf-8")

        # Ensure adapters are disabled after successful generation
        clear_pipeline_addons(pipe)

        return {
            "status": "COMPLETED",
            "result": {
                "image": base64_image,
                "time_taken": time_taken,
                "model_path_used": local_model_path,
                "model_type_used": model_type,
                "loras_applied": [
                    lora.local_path for lora in loras_to_apply
                ],  # Report which LoRAs were requested
                "tis_applied": [
                    ti.local_path for ti in tis_to_apply
                ],  # Report which TIs were requested
                "cached_base_model_used": is_cached_hit,  # Report if base model cache was used
                # Include loaded TI tokens in the response? Might help users build prompts.
                "loaded_ti_tokens": loaded_ti_tokens if tis_to_apply else None,
            },
        }

    except Exception as e:
        log.error(
            f"An unhandled error occurred during job processing: {e}",
        )
        # Clean cache entries on *any* top-level error? Helps if an error state corrupts the pipeline object.
        # Also attempt to disable adapters if pipe object exists
        if "_cached_pipeline" in globals() and _cached_pipeline is not None:
            try:
                clear_pipeline_addons(_cached_pipeline)
            except Exception as cleanup_error:
                log.error(f"Error during cleanup after job error: {cleanup_error}")

        _cached_pipeline = None
        _cached_model_path = None
        _cached_model_type = None
        _cached_model_device = None

        return {
            "status": "FAILED",
            "message": f"An unexpected error occurred: {str(e)}",
        }


# Start the RunPod serverless worker
log.info("Starting generator worker...")
runpod.serverless.start({"handler": handler})
