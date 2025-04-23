"""Handler file for downloading and deleting files."""

import urllib.parse
import runpod

from runpod import RunPodLogger
import requests
import typing as t
import os
import shutil
from pydantic import BaseModel
import urllib
import time
import subprocess

log = RunPodLogger()


class InputPayload(BaseModel):
    download_url: t.Optional[str] = None
    save_path: t.Optional[str] = None
    action: t.Literal["download", "delete", "deleteAll"] = "download"
    model_id: t.Optional[str] = None


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
            "status": "COMPLETED",
            "message": f"Download completed to {save_path}",
            "storage_used": storage_used_bytes,
        }

    except requests.exceptions.RequestException as e:
        storage_before_error = get_directory_size("/runpod-volume/")
        log.error(f"Error downloading {download_url}: {e}")
        return {
            "status": "ERROR",
            "message": f"Error downloading {download_url}: {e}",
            "storage_used": storage_before_error,
        }
    except OSError as e:
        storage_before_error = get_directory_size("/runpod-volume/")
        log.error(f"Error saving file to {save_path}: {e}")
        return {
            "status": "ERROR",
            "message": f"Error saving to {save_path}: {e}",
            "storage_used": storage_before_error,
        }
    except Exception as e:
        storage_before_error = get_directory_size("/runpod-volume/")
        log.error(f"Unexpected error during download: {e}")
        return {
            "status": "ERROR",
            "message": f"Unexpected error during download: {e}",
            "storage_used": storage_before_error,
        }


def download_file_direct(download_url: str, save_path: str):
    """Downloads a file directly using wget, bypassing temporary storage."""
    start_time = time.time()
    try:
        log.info(
            f"Starting direct download_file with wget for URL: {download_url}, save_path: {save_path}"
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

        query_params["token"] = [civitai_token] if civitai_token is not None else [""]
        updated_query_string = urllib.parse.urlencode(query_params, doseq=True)
        updated_download_url = urllib.parse.urlunparse(
            parsed_download_url._replace(query=updated_query_string)
        )
        log.debug(
            f"Constructed download URL (with token query param): {updated_download_url}"
        )  # Log constructed URL (be cautious if logging sensitive URLs)

        # Construct the wget command
        wget_command = [
            "wget",
            "-O",  # Specify output file
            save_path,
            updated_download_url,
        ]
        log.info(f"Executing wget command: {' '.join(wget_command)}")

        # Execute wget using subprocess (capture output and errors)
        process = subprocess.Popen(
            wget_command, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        stdout, stderr = process.communicate()  # Wait for process to complete

        if process.returncode != 0:
            storage_before_error = get_directory_size("/runpod-volume/")
            error_message = (
                f"wget failed with exit code {process.returncode}: {stderr.decode()}"
            )
            log.error(error_message)
            return {
                "status": "ERROR",
                "message": error_message,
                "storage_used": storage_before_error,
            }

        log.info(f"File downloaded successfully to {save_path}")

        storage_used_bytes = get_directory_size("/runpod-volume/")  # Re-check storage

        end_time = time.time()
        duration = end_time - start_time
        log.debug(f"Total wget execution time: {duration:.4f} seconds")

        return {
            "status": "COMPLETED",
            "message": f"Download completed to {save_path} (using wget)",
            "storage_used": storage_used_bytes,
        }

    except FileExistsError as e:
        storage_before_error = get_directory_size("/runpod-volume/")
        log.error(f"File already exists at {save_path}: {e}")
        return {
            "status": "ERROR",
            "message": f"File already exists at {save_path}: {e}",
            "storage_used": storage_before_error,
        }

    except OSError as e:
        storage_before_error = get_directory_size("/runpod-volume/")
        log.error(f"Error saving file to {save_path}: {e}")
        return {
            "status": "ERROR",
            "message": f"Error saving to {save_path}: {e}",
            "storage_used": storage_before_error,
        }
    except Exception as e:
        storage_before_error = get_directory_size("/runpod-volume/")
        log.error(f"Unexpected error during download: {e}")
        return {
            "status": "ERROR",
            "message": f"Unexpected error during download: {e}",
            "storage_used": storage_before_error,
        }


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
                "status": "COMPLETED",
                "message": f"File deleted successfully: {file_path}",
                "storage_used": storage_after_delete,  # Return storage after deletion
            }
        else:
            log.warn(f"File not found for deletion: {file_path}")

            # Get storage usage even if file not found
            storage_used_bytes = get_directory_size("/runpod-volume/")

            return {
                "status": "ERROR",
                "message": f"File not found: {file_path}",
                "storage_used": storage_used_bytes,  # Return storage even if file not found
            }
    except Exception as e:
        log.error(f"Error in delete_file for path {file_path}: {e}")
        # Get storage usage on error
        storage_used_bytes = get_directory_size("/runpod-volume/")
        return {
            "status": "ERROR",
            "message": f"Error deleting file: {e}",
            "storage_used": storage_used_bytes,
        }


def delete_all_files(directory_path: str) -> t.Dict:
    """Deletes all files and directories within the specified directory."""
    log.info(f"Starting deleteAll action for directory: {directory_path}")

    if not os.path.isdir(directory_path):
        log.error(f"Directory not found or is not a directory: {directory_path}")
        # Get storage size here too, even on error
        storage_used_bytes = get_directory_size("/runpod-volume/")
        return {
            "status": "ERROR",
            "message": f"Directory not found or is not a directory: {directory_path}",
            "storage_used": storage_used_bytes,
        }

    items_deleted = 0
    errors = []
    total_items = 0

    # Iterate through items IN the directory, not the directory itself
    # List items first to avoid issues with modifying the directory during iteration
    try:
        items_to_delete = [
            os.path.join(directory_path, item) for item in os.listdir(directory_path)
        ]
        total_items = len(items_to_delete)
        log.info(f"Found {total_items} items to attempt deletion in {directory_path}")
    except Exception as e:
        log.error(f"Error listing items in {directory_path}: {e}")
        storage_used_bytes = get_directory_size("/runpod-volume/")
        return {
            "status": "ERROR",
            "message": f"Error listing items in {directory_path}: {e}",
            "storage_used": storage_used_bytes,
        }

    for item_path in items_to_delete:
        try:
            if os.path.isfile(item_path) or os.path.islink(item_path):
                os.remove(item_path)
                log.debug(f"Deleted file: {item_path}")
                items_deleted += 1
            elif os.path.isdir(item_path):
                # Use shutil.rmtree for recursive directory deletion
                # This is generally safe for deleting directory trees
                shutil.rmtree(item_path)
                log.debug(f"Deleted directory tree: {item_path}")
                items_deleted += 1
            else:
                log.warn(f"Skipping unknown file type during deleteAll: {item_path}")
        except Exception as e:
            log.error(f"Error deleting item {item_path}: {e}")
            errors.append(f"Error deleting {item_path}: {e}")

    # After attempting deletion, get the final storage size
    storage_used_bytes = get_directory_size(directory_path)

    status = "COMPLETED" if not errors else "PARTIAL_COMPLETED"
    message = f"Attempted to delete all items in {directory_path}. Deleted {items_deleted}/{total_items} items."
    if errors:
        message += f" Errors encountered: {len(errors)}."

    log.info(
        f"Finished deleteAll action for directory {directory_path}. Status: {status}, Items deleted: {items_deleted}/{total_items}"
    )

    return {
        "status": status,
        "message": message,
        "errors": errors if errors else None,  # Include errors list if any
        "items_deleted": items_deleted,
        "total_items_attempted": total_items,
        "storage_used": storage_used_bytes,  # Return storage after deletion attempt
    }


def handler(job: t.Dict) -> t.Dict:
    """
    Handles the job by either downloading a file or deleting a file, or deleting all files.
    """
    try:
        log.debug(f"Starting handler, raw job input: {job}")
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
                    "status": "ERROR",
                    "message": "Missing download_url or save_path for download action.",
                    "storage_used": get_directory_size(
                        "/runpod-volume/"
                    ),  # Include storage on error
                }
            return download_file_direct(download_url, save_path)

        elif action == "delete":
            file_path: t.Optional[str] = job_input.save_path
            if not file_path:
                log.warn("Delete action missing file_path.")
                return {
                    "status": "ERROR",
                    "message": "Missing file_path for delete action.",
                    "storage_used": get_directory_size(
                        "/runpod-volume/"
                    ),  # Include storage on error
                }
            return delete_file(file_path)

        # New branch for the 'deleteAll' action
        elif action == "deleteAll":
            # The target directory is hardcoded for this action for safety/simplicity
            delete_target_directory = "/runpod-volume/"
            return delete_all_files(delete_target_directory)

        else:
            log.error(f"Unknown action received: {action}")
            # Include storage usage even on unknown action
            storage_used_bytes = get_directory_size("/runpod-volume/")
            return {
                "status": "ERROR",
                "message": f"Unknown action: {action}",
                "storage_used": storage_used_bytes,
            }

    except Exception as e:
        log.error(f"Error processing job in handler: {e}")
        # Include storage usage even if a top-level handler error occurs
        storage_used_bytes = get_directory_size("/runpod-volume/")
        return {
            "status": "ERROR",
            "message": f"Error processing job: {e}",
            "storage_used": storage_used_bytes,
        }


# Start the RunPod serverless worker
runpod.serverless.start({"handler": handler})
