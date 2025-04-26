# download_pretrained.py
import os
import time
import urllib.parse
import subprocess
from huggingface_hub import snapshot_download  # ADDED import
import torch  # ADDED import (needed for dtype info in potential future steps)
import typing as t  # ADDED import for type hinting


DOWNLOAD_MAP = [
    {
        "url": "https://civitai.com/api/download/models/1015638",
        "path": "/defaults/workspace/loras/JAV_HARD_BDSM_Generator__bondage_wall___Pony_XL____________________________/JAV_DDT636_643_Pony_V2/JAV_DDT636_643_Pony_V2.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/542806",
        "path": "/defaults/workspace/models/________china_maid_XL_pony_ill_SD_/v1.0_SD1.5/china_maid_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1412789",
        "path": "/defaults/workspace/models/boleromix_illustrious_/v2.90/boleromixIllustrious_v290.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/700275",
        "path": "/defaults/workspace/loras/Shibari___Bondage___DID_Helper__SDXL_Pony_/v0.7/hskc-bondage-pony-v0.7.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/646872",
        "path": "/defaults/workspace/loras/________garter_ring_XL_ILL_pony_/v1.0_XL/garter_ring_XL_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1177282",
        "path": "/defaults/workspace/loras/_______maid_bikini_XL_ILL_pony_/v1.0_illustrious/maid_bikini_illustrious_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/809460",
        "path": "/defaults/workspace/loras/BondagePlay/v1.0/bondage1.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/121077",
        "path": "/defaults/workspace/loras/human_dog_suit/v1.0/humandog.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/56789",
        "path": "/defaults/workspace/loras/BDSM/v3/qqq-BDSM-v3-000010.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1007434",
        "path": "/defaults/workspace/loras/Gibbet_bondage_setup/v1.0/Gibbet_PDXL_epoch_3.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/122632",
        "path": "/defaults/workspace/loras/Kidnapped___bdsm___willing_partner/v0.2/kidnap_v0.2.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/543689",
        "path": "/defaults/workspace/models/boleromix_SDXL_/v1.3/boleromixSDXL_v13.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1458666",
        "path": "/defaults/workspace/models/boleromix_Pony_/v2.10/boleromixPony_v210.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/63980",
        "path": "/defaults/workspace/loras/_Concept_Bound_Gift_in_Box_____/v1.0/GiftInBoxV1.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1400484",
        "path": "/defaults/workspace/loras/Bondage_Suspension/v1.0__Illustrious_/suspensionIllustrious.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/569821",
        "path": "/defaults/workspace/loras/_____witch_cos_XL_ill_pony_/v1.0/witch_XL_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/390021",
        "path": "/defaults/workspace/models/boleromix_SD_/v1.0/boleromixSD_v10.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1703115",
        "path": "/defaults/workspace/loras/______pussy_spreader/v1.1_noob/pussy_spreader_noobep_V1.1.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/651198",
        "path": "/defaults/workspace/loras/_____harness_SD_XL_pony_/v1.0_pony/harness_pony_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/648302",
        "path": "/defaults/workspace/loras/______choker_SD_XL_ILL_pony_/v1.0_XL/chocker_XL_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1696317",
        "path": "/defaults/workspace/loras/Breast_Bondage_Helper_-_Pony_Illustrious/v1.0_Illustrious/breast_bondage_ill_v1.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/579281",
        "path": "/defaults/workspace/loras/0683_humiliating_bondage/v1.0/0683_humiliating_bondage_v1_pony.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1534086",
        "path": "/defaults/workspace/loras/X_________X_micro_bikini_SD_XL_illustrious_pony_/v1.0_noob/x_micro_bikini_noobai_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/427654",
        "path": "/defaults/workspace/loras/tied_toes_bound_feet_for_pony/tied_toes_pony/tied_toes_pony-000021.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/1172279",
        "path": "/defaults/workspace/models/_____Triangular_Wooden_Horse_ILL_pony_/v1.0_illustrious/triangular_wooden_horse_illustrious_V1.0.safetensors",
    },
    {
        "url": "https://civitai.com/api/download/models/639086",
        "path": "/defaults/workspace/loras/________bondage_outfit_XL_ILL_pony_/v1.0_pony/bondage_outfit_pony_V1.0.safetensors",
    },
]

HF_MODEL_REPOS = [
    {
        "repo_id": "stabilityai/stable-diffusion-xl-base-1.0",
        "local_dir": "/defaults/stable-diffusion-xl-base-1.0",  # Dedicated directory for SDXL base
        "revision": "main",
        # Ignore large checkpoint files if they exist alongside diffusers format
        "ignore_patterns": [
            "*.ckpt",
            "*.safetensors",
        ],  # Sometimes model_index.json can point to single files, ignore if needed
    },
    {
        "repo_id": "runwayml/stable-diffusion-v1-5",
        "local_dir": "/defaults/stable-diffusion-v1-5",  # Dedicated directory for SD1.5 base
        "revision": "main",
        "ignore_patterns": ["*.ckpt", "*.safetensors"],
    },
    # Add other base models if needed for your custom checkpoints
]

# Optional: Civitai API Token for higher rate limits, passed as an environment variable during build
CIVITAI_API_TOKEN = "9f61f82876b8b2efbd8764e206ff8f2b"


def download_file_direct(download_url: str, save_path: str):
    """Downloads a file directly using wget, bypassing temporary storage."""
    # Keep your existing wget download function
    start_time = time.time()
    try:
        print(
            f"Starting direct download_file with wget for URL: {download_url}, save_path: {save_path}"
        )
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        print(f"Ensured save directory exists: {os.path.dirname(save_path)}")

        parsed_download_url = urllib.parse.urlparse(download_url)
        query_params = urllib.parse.parse_qs(parsed_download_url.query)
        civitai_token = CIVITAI_API_TOKEN
        print(
            f"Retrieved Civitai Token from environment variable: {civitai_token is not None}"
        )

        query_params["token"] = [civitai_token] if civitai_token is not None else [""]
        updated_query_string = urllib.parse.urlencode(query_params, doseq=True)
        updated_download_url = urllib.parse.urlunparse(
            parsed_download_url._replace(query=updated_query_string)
        )
        # Avoid logging the full token in the URL for security
        print(f"Constructed download URL (with token query param added)")

        # Construct the wget command
        wget_command = [
            "wget",
            "-O",  # Specify output file
            save_path,
            updated_download_url,
        ]
        print(f"Executing wget command: {' '.join(wget_command)}")

        # Execute wget using subprocess (capture output and errors)
        process = subprocess.Popen(
            wget_command, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        stdout, stderr = process.communicate()  # Wait for process to complete

        if process.returncode != 0:
            error_message = (
                f"wget failed with exit code {process.returncode}: {stderr.decode()}"
            )
            print(error_message)
            return {
                "status": "ERROR",
                "message": error_message,
            }

        print(f"File downloaded successfully to {save_path}")

        end_time = time.time()
        duration = end_time - start_time
        print(f"Total wget execution time: {duration:.4f} seconds")

        return {
            "status": "COMPLETED",
            "message": f"Download completed to {save_path} (using wget)",
        }

    except FileExistsError as e:
        print(f"File already exists at {save_path}: {e}")
        return {
            "status": "ERROR",
            "message": f"File already exists at {save_path}: {e}",
        }

    except OSError as e:
        print(f"Error saving file to {save_path}: {e}")
        return {
            "status": "ERROR",
            "message": f"Error saving to {save_path}: {e}",
        }
    except Exception as e:
        print(f"Unexpected error during download: {e}")
        return {
            "status": "ERROR",
            "message": f"Unexpected error during download: {e}",
        }


def download_hf_repo(
    repo_id: str,
    local_dir: str,
    revision: str = "main",
    ignore_patterns: t.Optional[t.List[str]] = None,
):
    """Downloads a Hugging Face repo using snapshot_download."""
    start_time = time.time()
    try:
        print(
            f"Starting Hugging Face repo download for repo_id: {repo_id}, local_dir: {local_dir}"
        )
        os.makedirs(local_dir, exist_ok=True)  # Ensure directory exists

        # Check if download has already happened (e.g., check for a known file)
        # This is a simple check, not guaranteed to be perfect
        if os.path.exists(os.path.join(local_dir, "model_index.json")):
            print(
                f"Model index found in {local_dir}. Assuming repo {repo_id} is already downloaded."
            )
            return {
                "status": "SKIPPED",
                "message": f"Repo {repo_id} already downloaded to {local_dir}",
            }

        # Use snapshot_download to get the full repo content
        # RunPod's base image configures HF_HOME, so cache_dir might not be needed explicitly
        snapshot_download(
            repo_id=repo_id,
            local_dir=local_dir,
            revision=revision,
            local_files_only=False,  # Must download from hub
            ignore_patterns=ignore_patterns,
            max_workers=8,  # Use multiple workers for faster download
        )

        print(f"Hugging Face repo download completed successfully to {local_dir}")

        end_time = time.time()
        duration = end_time - start_time
        print(f"Total Hugging Face repo download time: {duration:.4f} seconds")

        return {
            "status": "COMPLETED",
            "message": f"Hugging Face repo download completed to {local_dir}",
        }

    except Exception as e:
        print(f"Unexpected error during Hugging Face repo download for {repo_id}: {e}")
        return {
            "status": "ERROR",
            "message": f"Unexpected error during Hugging Face repo download for {repo_id}: {e}",
        }


if __name__ == "__main__":
    print("Starting pre-trained model download script...")

    # Download Hugging Face repos (base models)
    print("\n--- Downloading Hugging Face Base Repos ---")
    for repo_config in HF_MODEL_REPOS:
        result = download_hf_repo(**repo_config)
        print(result["message"])
        if result["status"] == "ERROR":
            # You might want to exit here if base models are essential
            pass  # Or continue with a warning

    print("\n--- Downloading Custom Files from DOWNLOAD_MAP ---")
    for item in DOWNLOAD_MAP:
        # Added a check for file existence before downloading again
        if os.path.exists(item["path"]):
            print(f"File already exists, skipping download: {item['path']}")
            continue
        result = download_file_direct(item["url"], item["path"])
        print(result["message"])
        if result["status"] == "ERROR":
            # You might want to exit here or log more severely
            pass  # Or continue with a warning

    print("\nPre-trained model download script finished.")
