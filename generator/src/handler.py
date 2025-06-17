import os  # Added for path manipulation if needed later
import time
import runpod
import requests
from requests.adapters import HTTPAdapter, Retry
from runpod import RunPodLogger

logger = RunPodLogger()

LOCAL_URL = "http://127.0.0.1:3000/sdapi/v1"

automatic_session = requests.Session()
retries = Retry(total=10, backoff_factor=0.1, status_forcelist=[502, 503, 504])
automatic_session.mount("http://", HTTPAdapter(max_retries=retries))

# ---------------------------------------------------------------------------- #
#                              Automatic Functions                             #
# ---------------------------------------------------------------------------- #
def wait_for_service(url):
    """
    Check if the service is ready to receive requests.
    """
    retries = 0

    while True:
        try:
            requests.get(url, timeout=120)
            return
        except requests.exceptions.RequestException:
            retries += 1

            # Only log every 15 retries so the logs don't get spammed
            if retries % 15 == 0:
                print("Service not ready yet. Retrying...")
        except Exception as err:
            print("Error: ", err)

        time.sleep(0.2)


def generate_image_a1111(inference_request):
    """
    Run image generation inference using Automatic1111.
    """

    logger.log(inference_request)

    response = None  # Initialize response to None
    try:
        response = automatic_session.post(
            url=f"{LOCAL_URL}/txt2img", json=inference_request, timeout=600
        )
        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.log(f"Request to Automatic1111 failed: {e}")
        logger.log(f"Response content: {response.text if response else 'No response'}")
        raise  # Re-raise the exception after logging
    except ValueError as e:
        logger.log(f"Failed to parse JSON response from Automatic1111: {e}")
        logger.log(f"Response content: {response.text if response else 'No response'}")
        raise  # Re-raise the exception after logging
    except Exception as e:
        logger.log(f"An unexpected error occurred during image generation: {e}")
        raise  # Re-raise the exception after logging


# ---------------------------------------------------------------------------- #
#                                RunPod Handler                                #
# ---------------------------------------------------------------------------- #
def handler(event):
    """
    This is the handler function that will be called by the serverless.
    It dispatches to different functions based on the job_type in the input.
    """
    job_type = event["input"].get("job_type")
    request_data = event["input"].get("data")

    if job_type == "generate_image":
        result = generate_image_a1111(request_data)
    else:
        raise ValueError(f"Unknown job_type: {job_type}")

    # return the output that you want to be returned like pre-signed URLs to output artifacts
    return result


if __name__ == "__main__":
    wait_for_service(url=f"{LOCAL_URL}/sd-models")

    print("WebUI API Service is ready. Starting RunPod Serverless...")
    runpod.serverless.start({"handler": handler})
