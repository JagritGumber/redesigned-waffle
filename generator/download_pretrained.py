# download_pretrained.py
import os
import time
import urllib.parse
import subprocess
import requests
from huggingface_hub import snapshot_download


response = requests.get(
    "https://accepted-consistency-danny-varies.trycloudflare.com/api/v1/model/default"
)

DOWNLOAD_MAP = response.json()["items"]

# Optional: Civitai API Token for higher rate limits, passed as an environment variable during build
CIVITAI_API_TOKEN = "9f61f82876b8b2efbd8764e206ff8f2b"


def download_huggingface_model(model_name: str, save_dir: str):
    """Downloads a Hugging Face model and its tokenizer."""
    print(f"Starting download for Hugging Face model: {model_name} to {save_dir}")
    try:
        # Download model files
        snapshot_download(repo_id=model_name, local_dir=save_dir, local_dir_use_symlinks=False)
        print(f"Hugging Face model {model_name} downloaded successfully to {save_dir}")
        return {"status": "COMPLETED", "message": f"Hugging Face model {model_name} downloaded."}
    except Exception as e:
        print(f"Error downloading Hugging Face model {model_name}: {e}")
        return {"status": "ERROR", "message": f"Error downloading Hugging Face model {model_name}: {e}"}


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


if __name__ == "__main__":
    print("Starting pre-trained model download script...")

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

    print("\n--- Downloading Hugging Face Models ---")
    # Define the Hugging Face model to download
    HUGGINGFACE_MODELS = [
        {"name": "KBlueLeaf/DanTagGen-delta-rev2", "path": "./models/DanTagGen-delta-rev2"}
    ]

    for hf_model in HUGGINGFACE_MODELS:
        model_name = hf_model["name"]
        save_path = hf_model["path"]
        # Check if the directory exists and is not empty
        if os.path.exists(save_path) and os.listdir(save_path):
            print(f"Hugging Face model already exists, skipping download: {model_name} at {save_path}")
            continue
        result = download_huggingface_model(model_name, save_path)
        print(result["message"])
        if result["status"] == "ERROR":
            pass # Or handle error as needed

    print("\nPre-trained model download script finished.")
