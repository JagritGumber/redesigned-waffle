# download_pretrained.py
import os
import time
import urllib.parse
import subprocess

# --- Configuration: Mapping of Download URLs to Target File Paths ---
# Ensure these paths exactly match what your generator worker expects
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

# Optional: Civitai API Token for higher rate limits, passed as an environment variable during build
CIVITAI_API_TOKEN = os.environ.get(
    "RUNPOD_CIVITAI_TOKEN", "9f61f82876b8b2efbd8764e206ff8f2b"
)


def download_file_direct(download_url: str, save_path: str):
    """Downloads a file directly using wget, bypassing temporary storage."""
    start_time = time.time()
    try:
        print(
            f"Starting direct download_file with wget for URL: {download_url}, save_path: {save_path}"
        )
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        print(f"Ensured save directory exists: {os.path.dirname(save_path)}")

        parsed_download_url = urllib.parse.urlparse(download_url)
        query_params = urllib.parse.parse_qs(parsed_download_url.query)
        civitai_token = os.environ.get("RUNPOD_CIVITAI_TOKEN")
        # It's safer to not log the full token value
        print(
            f"Retrieved Civitai Token from environment variable: {civitai_token is not None}"
        )

        query_params["token"] = [civitai_token] if civitai_token is not None else [""]
        updated_query_string = urllib.parse.urlencode(query_params, doseq=True)
        updated_download_url = urllib.parse.urlunparse(
            parsed_download_url._replace(query=updated_query_string)
        )
        print(
            f"Constructed download URL (with token query param): {updated_download_url}"
        )  # Log constructed URL (be cautious if logging sensitive URLs)

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


if __name__ == "__main__":
    print("Starting pre-trained model download script...")
    for item in DOWNLOAD_MAP:
        download_file_direct(item["url"], item["path"])
    print("Pre-trained model download script finished.")
