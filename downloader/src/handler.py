"""Handler file for downloading and deleting files."""

import urllib.parse
import runpod

from runpod import RunPodLogger
import requests
import typing as t
import os
from pydantic import BaseModel
import urllib
import time

log = RunPodLogger()


class InputPayload(BaseModel):
    download_url: t.Optional[str] = None
    save_path: t.Optional[str] = None
    action: t.Literal["download", "delete"] = "download"


def get_directory_size(directory: str) -> int:
    """Calculates the total size of a directory in bytes."""
    start_time = time.time()
    total_size = 0
    try:
        log.info(f"Starting get_directory_size for directory: {directory}")
        for dirpath, dirnames, filenames in os.walk(directory):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                # Skip if it is symbolic link
                if not os.path.islink(fp):
                    try:
                        total_size += os.path.getsize(fp)
                    except Exception as file_size_err:
                        # Log errors getting individual file sizes but continue
                        log.warn(f"Could not get size for file {fp}: {file_size_err}")
        log.info(f"Finished get_directory_size, total size: {total_size} bytes")
    except Exception as e:
        log.error(f"Error in get_directory_size for directory {directory}: {e}")
        # Decide if you want to return 0 or re-raise the exception
        # Returning 0 is safer to not stop the job entirely if size check fails
        return 0
    finally:
        end_time = time.time()
        duration = end_time - start_time
        log.debug(f"get_directory_size execution time: {duration:.4f} seconds")
    return total_size


def download_file(download_url: str, save_path: str):
    """Downloads a file from a URL and saves it to the specified path."""
    start_time = time.time()
    try:
        log.info(
            f"Starting download_file for URL: {download_url}, save_path: {save_path}"
        )
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        log.debug(f"Ensured save directory exists: {os.path.dirname(save_path)}")

        parsed_download_url = urllib.parse.urlparse(download_url)
        query_params = urllib.parse.parse_qs(parsed_download_url.query)
        civitai_token = os.environ.get("RUNPOD_CIVITAI_TOKEN")
        # It's safer to not log the full token value
        log.debug(
            f"Retrieved Civitai Token from environment variable: {civitai_token is not None}"
        )

        # Note: Appending token as query parameter is less secure than using headers.
        # If possible, use headers instead. If not, ensure the endpoint expects token this way.
        query_params["token"] = [civitai_token] if civitai_token is not None else [""]
        updated_query_string = urllib.parse.urlencode(query_params, doseq=True)
        updated_download_url = urllib.parse.urlunparse(
            parsed_download_url._replace(query=updated_query_string)
        )
        log.debug(
            f"Constructed download URL (with token query param): {updated_download_url}"
        )  # Log constructed URL (be cautious if logging sensitive URLs)

        response = requests.get(updated_download_url, stream=True)
        response.raise_for_status()  # Raise an exception for bad status codes
        log.info(f"Download request successful, status code: {response.status_code}")

        log.info(f"Starting file write to {save_path}")
        with open(save_path, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                file.write(chunk)
        log.info(f"File write completed for {save_path}")

        log.info(f"Download completed for {download_url} to {save_path}")

        # Get storage usage *after* download
        storage_used_bytes = get_directory_size("/runpod-volume/")

        end_time = time.time()
        duration = end_time - start_time
        log.debug(f"Total download_file execution time: {duration:.4f} seconds")

        return {
            "status": "completed",
            "message": f"Download completed to {save_path}",
            "storage_used": storage_used_bytes,
        }

    except requests.exceptions.RequestException as e:
        log.error(f"Error downloading {download_url}: {e}")
        return {"status": "error", "message": f"Error downloading {download_url}: {e}"}
    except OSError as e:
        log.error(f"Error saving file to {save_path}: {e}")
        return {"status": "error", "message": f"Error saving to {save_path}: {e}"}
    except Exception as e:
        log.error(f"Unexpected error during download: {e}")
        return {"status": "error", "message": f"Unexpected error during download: {e}"}


def delete_file(file_path: str) -> t.Dict:
    """Deletes a file at the specified path."""
    try:
        log.info(f"Starting delete_file for path: {file_path}")

        # Get storage usage *before* deletion
        storage_before_delete = get_directory_size("/runpod-volume/")
        log.debug(
            f"Storage size before deleting {file_path}: {storage_before_delete} bytes"
        )

        if os.path.exists(file_path):
            os.remove(file_path)
            log.info(f"File deleted successfully: {file_path}")

            # Get storage usage *after* deletion
            storage_after_delete = get_directory_size("/runpod-volume/")
            log.debug(
                f"Storage size after deleting {file_path}: {storage_after_delete} bytes"
            )

            return {
                "status": "success",
                "message": f"File deleted successfully: {file_path}",
                "storage_used": storage_after_delete,  # Return storage after deletion
            }
        else:
            log.warn(f"File not found for deletion: {file_path}")

            # Get storage usage even if file not found
            storage_used_bytes = get_directory_size("/runpod-volume/")

            return {
                "status": "error",
                "message": f"File not found: {file_path}",
                "storage_used": storage_used_bytes,  # Return storage even if file not found
            }
    except Exception as e:
        log.error(f"Error in delete_file for path {file_path}: {e}")
        # Get storage usage on error
        storage_used_bytes = get_directory_size("/runpod-volume/")
        return {
            "status": "error",
            "message": f"Error deleting file: {e}",
            "storage_used": storage_used_bytes,
        }


def handler(job: t.Dict) -> t.Dict:
    """
    Handles the job by either downloading a file or deleting a file.
    """
    try:
        # Log the full job input at DEBUG level (can be chatty)
        log.debug(f"Starting handler, raw job input: {job}")
        # Log job input ID and action at INFO level
        job_id = job.get("id", "N/A")
        action = job.get("input", {}).get("action", "N/A")
        log.info(f"Processing job ID: {job_id}, Action: {action}")

        job_input = InputPayload(**job["input"])
        action: str = job_input.action

        if action == "download":
            download_url: t.Optional[str] = job_input.download_url
            save_path: t.Optional[str] = job_input.save_path

            if not download_url or not save_path:
                log.warn("Download action missing download_url or save_path.")
                return {
                    "status": "error",
                    "message": "Missing download_url or save_path for download action.",
                    "storage_used": get_directory_size("/runpod-volume/"),
                }
            return download_file(download_url, save_path)

        elif action == "delete":
            file_path: t.Optional[str] = job_input.save_path
            if not file_path:
                log.warn("Delete action missing file_path.")
                return {
                    "status": "error",
                    "message": "Missing file_path for delete action.",
                    "storage_used": get_directory_size("/runpod-volume/"),
                }
            return delete_file(file_path)

        else:
            log.error(f"Unknown action received: {action}")
            return {"status": "error", "message": f"Unknown action: {action}"}

    except Exception as e:
        log.error(f"Error processing job in handler: {e}")
        return {"status": "error", "message": f"Error processing job: {e}"}


# Start the RunPod serverless worker
runpod.serverless.start({"handler": handler})
