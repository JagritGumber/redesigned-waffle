import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def build_url(manager_url: str) -> str:
    return manager_url.rstrip("/") + "/api/v1/webhooks/model-image"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Report a RunPod model image build status back to the manager."
    )
    parser.add_argument("--manager-url", default=os.environ.get("MANAGER_WEBHOOK_URL"))
    parser.add_argument("--token", default=os.environ.get("MANAGER_WEBHOOK_TOKEN"))
    parser.add_argument("--build-trigger-id", required=True)
    parser.add_argument(
        "--status",
        required=True,
        choices=["PENDING", "BUILDING", "UPLOADING", "TESTING", "COMPLETED", "DEPLOYED", "FAILED"],
    )
    parser.add_argument("--image")
    parser.add_argument("--message")
    args = parser.parse_args()

    if not args.manager_url:
        raise SystemExit("Missing --manager-url or MANAGER_WEBHOOK_URL.")

    payload = {
        "buildTriggerId": args.build_trigger_id,
        "status": args.status,
    }
    if args.image:
        payload["image"] = args.image
    if args.message:
        payload["message"] = args.message

    headers = {"Content-Type": "application/json"}
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"

    request = urllib.request.Request(
        build_url(args.manager_url),
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            print(body)
    except urllib.error.HTTPError as error:
        sys.stderr.write(error.read().decode("utf-8") + "\n")
        raise SystemExit(error.code)


if __name__ == "__main__":
    main()
