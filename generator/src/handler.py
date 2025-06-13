import time
import runpod
import requests
from requests.adapters import HTTPAdapter, Retry
from runpod import RunPodLogger
from transformers.pipelines import pipeline
from transformers.models.auto.tokenization_auto import AutoTokenizer
from transformers.models.auto.modeling_auto import AutoModelForCausalLM

logger = RunPodLogger()

LOCAL_URL = "http://127.0.0.1:3000/sdapi/v1"

automatic_session = requests.Session()
retries = Retry(total=10, backoff_factor=0.1, status_forcelist=[502, 503, 504])
automatic_session.mount("http://", HTTPAdapter(max_retries=retries))

# Load the DanTagGen model from local path
MODEL_PATH = "./models/DanTagGen-delta-rev2"
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)
model = AutoModelForCausalLM.from_pretrained(MODEL_PATH, local_files_only=True)
tag_generator = pipeline("text-generation", model=model, tokenizer=tokenizer)


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


def generate_prompt_ai_dan_tag_gen(prompt_request):
    """
    Generate prompt using AI Dan Tag Gen.
    """
    logger.log("Generating prompt with AI Dan Tag Gen:", prompt_request)

    # Extract the prompt from the request
    input_prompt = prompt_request.get("prompt", "")

    # Generate tags using the DanTagGen model
    generated_output = tag_generator(input_prompt)
    generated_tags = ""
    if (
        generated_output
        and isinstance(generated_output, list)
        and len(generated_output) > 0
    ):
        generated_tags = generated_output[0].get("generated_text", "")
    else:
        logger.log(
            f"Error: DanTagGen pipeline did not return expected output. Output: {generated_output}"
        )
        generated_tags = ""  # Fallback to empty string if generation fails

    # Combine the input prompt with the generated tags
    full_prompt = f"{input_prompt}, {generated_tags}"

    return {"generated_prompt": full_prompt}


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
    elif job_type == "generate_prompt":
        result = generate_prompt_ai_dan_tag_gen(request_data)
    else:
        raise ValueError(f"Unknown job_type: {job_type}")

    # return the output that you want to be returned like pre-signed URLs to output artifacts
    return result


if __name__ == "__main__":
    wait_for_service(url=f"{LOCAL_URL}/sd-models")
    print("WebUI API Service is ready. Starting RunPod Serverless...")
    runpod.serverless.start({"handler": handler})
