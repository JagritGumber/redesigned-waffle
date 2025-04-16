"""Handler file for downloading a file from a URL to a specified path."""

import runpod
import requests
import typing as t
import os
from pydantic import BaseModel


class InputPayload(BaseModel):
    download_url: str
    save_path: str


def handler(job: t.Dict) -> t.Dict:
    """
    Downloads a file from a given URL and saves it to the specified path.

    Args:
        job (dict): A dictionary containing the job input, which should include:
            - download_url (str): The URL of the file to download.
            - save_path (str): The path where the file should be saved.

    Returns:
        dict: A dictionary containing the result of the operation:
            - status (str): "success" if the download and save were successful,
                            "error" otherwise.
            - message (str): A message providing more details about the operation.
    """
    try:
        job_input = InputPayload(**job["input"])
        download_url: str = job_input.download_url
        save_path: str = job_input.save_path

        response = requests.get(download_url, stream=True)
        response.raise_for_status()  # Raise an exception for bad status codes

        # Ensure the directory for the save path exists
        os.makedirs(os.path.dirname(save_path), exist_ok=True)

        with open(save_path, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                file.write(chunk)

        return {
            "status": "success",
            "message": f"File downloaded successfully to '{save_path}' from '{download_url}'.",
        }

    except requests.exceptions.RequestException as e:
        return {
            "status": "error",
            "message": f"Error downloading file from '{job["input"]}': {e}",
        }
    except OSError as e:
        return {
            "status": "error",
            "message": f"Error saving file to '{job["input"]}': {e}",
        }
    except Exception as e:
        return {"status": "error", "message": f"An unexpected error occurred: {e}"}


runpod.serverless.start({"handler": handler})
