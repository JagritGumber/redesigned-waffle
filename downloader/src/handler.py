"""Handler file for downloading and deleting files."""

import urllib.parse
import runpod
import requests
import typing as t
import os
from pydantic import BaseModel
import urllib


class InputPayload(BaseModel):
    download_url: t.Optional[str] = None
    save_path: t.Optional[str] = None
    action: t.Literal["download", "delete"] = "download"


def get_directory_size(directory: str) -> int:
    """Calculates the total size of a directory in bytes."""
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(directory):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            # Skip if it is symbolic link
            if not os.path.islink(fp):
                total_size += os.path.getsize(fp)
    return total_size


def download_file(download_url: str, save_path: str):
    """Downloads a file from a URL and saves it to the specified path."""
    try:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        parsed_download_url = urllib.parse.urlparse(download_url)
        query_params = urllib.parse.parse_qs(parsed_download_url.query)
        civitai_token = os.environ.get("RUNPOD_CIVITAI_TOKEN")
        query_params["token"] = [civitai_token] if civitai_token is not None else [""]
        updated_query_string = urllib.parse.urlencode(query_params, doseq=True)
        updated_download_url = urllib.parse.urlunparse(
            parsed_download_url._replace(query=updated_query_string)
        )
        response = requests.get(updated_download_url, stream=True)
        response.raise_for_status()  # Raise an exception for bad status codes

        with open(save_path, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                file.write(chunk)

        print(f"Download completed for {download_url} to {save_path}")
        storage_used_bytes = get_directory_size("/runpod-volume/")
        return {
            "status": "completed",
            "message": f"Download completed to {save_path}",
            "storage_used": storage_used_bytes,
        }

    except requests.exceptions.RequestException as e:
        print(f"Error downloading {download_url}: {e}")
        return {"status": "error", "message": f"Error downloading {download_url}: {e}"}
    except OSError as e:
        print(f"Error saving to {save_path}: {e}")
        return {"status": "error", "message": f"Error saving to {save_path}: {e}"}
    except Exception as e:
        print(f"Unexpected error during download: {e}")
        return {"status": "error", "message": f"Unexpected error during download: {e}"}


def delete_file(file_path: str) -> t.Dict:
    """Deletes a file at the specified path."""
    try:
        storage_used_bytes = get_directory_size("/runpod-volume/")
        if os.path.exists(file_path):
            os.remove(file_path)
            return {
                "status": "success",
                "message": f"File deleted successfully: {file_path}",
                "storage_used": storage_used_bytes,
            }
        else:
            return {
                "status": "error",
                "message": f"File not found: {file_path}",
                "storage_used": storage_used_bytes,
            }
    except Exception as e:
        return {"status": "error", "message": f"Error deleting file: {e}"}


def handler(job: t.Dict) -> t.Dict:
    """
    Handles the job by either downloading a file or deleting a file.
    """
    try:
        job_input = InputPayload(**job["input"])
        action: str = job_input.action

        if action == "download":
            download_url: t.Optional[str] = job_input.download_url
            save_path: t.Optional[str] = job_input.save_path

            if not download_url or not save_path:
                return {
                    "status": "error",
                    "message": "Missing download_url or save_path for download action.",
                }
            return download_file(download_url, save_path)

        elif action == "delete":
            file_path: t.Optional[str] = job_input.save_path
            if not file_path:
                return {
                    "status": "error",
                    "message": "Missing file_path for delete action.",
                }
            return delete_file(file_path)

        else:
            return {"status": "error", "message": f"Unknown action: {action}"}

    except Exception as e:
        return {"status": "error", "message": f"Error processing job: {e}"}


runpod.serverless.start({"handler": handler})
