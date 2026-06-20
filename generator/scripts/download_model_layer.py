import argparse
import hashlib
import json
import os
import subprocess
import urllib.parse

ALLOWED_OUTPUT_PREFIXES = (
    "/defaults/",
    "/runpod-volume/",
)


def civitai_token() -> str | None:
    secret_path = "/run/secrets/civitai_api_token"
    if os.path.exists(secret_path):
        with open(secret_path, "r", encoding="utf-8") as file:
            token = file.read().strip()
            if token:
                return token
    return os.environ.get("CIVITAI_API_TOKEN")


def with_civitai_token(url: str) -> str:
    token = civitai_token()
    if not token:
        return url

    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or ""
    if host != "civitai.com" and not host.endswith(".civitai.com"):
        return url

    query = urllib.parse.parse_qs(parsed.query)
    query["token"] = [token]
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))


def validate_output_path(path: str) -> None:
    normalized = os.path.realpath(path)
    if not any(normalized.startswith(prefix) for prefix in ALLOWED_OUTPUT_PREFIXES):
        raise RuntimeError(
            f"Model migration path must be under one of {ALLOWED_OUTPUT_PREFIXES}; got {path}"
        )


def sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    with open(args.manifest, "r", encoding="utf-8") as file:
        manifest = json.load(file)

    if manifest.get("noop"):
        print(f"Skipping no-op model migration {manifest.get('id', args.manifest)}")
        os.makedirs("/defaults", exist_ok=True)
        os.makedirs("/runpod-volume/workspace/models", exist_ok=True)
        os.makedirs("/runpod-volume/workspace/loras", exist_ok=True)
        os.makedirs("/runpod-volume/workspace/embeddings", exist_ok=True)
        return

    url = manifest["url"]
    output_path = manifest["path"]
    validate_output_path(output_path)
    expected_sha256 = manifest.get("sha256")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if os.path.exists(output_path):
        if not expected_sha256 or sha256(output_path) == expected_sha256:
            print(f"Model already exists for migration {manifest['id']}: {output_path}")
            return
        os.remove(output_path)

    subprocess.run(["wget", "-q", "-O", output_path, with_civitai_token(url)], check=True)

    if expected_sha256:
        actual_sha256 = sha256(output_path)
        if actual_sha256 != expected_sha256:
            os.remove(output_path)
            raise RuntimeError(
                f"SHA256 mismatch for {manifest['id']}: expected {expected_sha256}, got {actual_sha256}"
            )

    print(f"Installed model migration {manifest['id']} to {output_path}")


if __name__ == "__main__":
    main()
