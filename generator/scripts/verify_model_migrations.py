import json
import os
import shutil
import subprocess
import sys
import tempfile
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
GENERATOR = ROOT / "generator"
SCRIPTS = GENERATOR / "scripts"


def run_script(script: str, *args: str, root: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["GENERATOR_MIGRATION_ROOT"] = str(root)
    return subprocess.run(
        [sys.executable, str(SCRIPTS / script), *args],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=check,
    )


def fail(message: str) -> None:
    raise SystemExit(message)


def verify_download_token_scope() -> None:
    spec = importlib.util.spec_from_file_location(
        "download_model_layer", SCRIPTS / "download_model_layer.py"
    )
    if not spec or not spec.loader:
        fail("Could not load download_model_layer.py for token scope verification.")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    previous_token = os.environ.get("CIVITAI_API_TOKEN")
    os.environ["CIVITAI_API_TOKEN"] = "secret-token"
    try:
        civitai_url = module.with_civitai_token("https://civitai.com/api/download/models/123?foo=bar")
        external_url = module.with_civitai_token("https://example.com/model.safetensors?foo=bar")
    finally:
        if previous_token is None:
            os.environ.pop("CIVITAI_API_TOKEN", None)
        else:
            os.environ["CIVITAI_API_TOKEN"] = previous_token

    if "token=secret-token" not in civitai_url:
        fail("Downloader should append the Civitai token to Civitai download URLs.")
    if "token=secret-token" in external_url:
        fail("Downloader must not append the Civitai token to non-Civitai URLs.")


def main() -> None:
    verify_download_token_scope()

    with tempfile.TemporaryDirectory(prefix="model-migration-verify-") as tmp:
        root = Path(tmp)
        generator = root / "generator"
        migrations = generator / "model-migrations"
        migrations.mkdir(parents=True)

        shutil.copy2(GENERATOR / "Dockerfile", generator / "Dockerfile")
        shutil.copytree(GENERATOR / "model-migrations", migrations, dirs_exist_ok=True)

        run_script(
            "add_model_migration.py",
            "--id",
            "verify-model-1",
            "--url",
            "https://civitai.com/api/download/models/123?token=secret-token&foo=bar",
            "--path",
            "/runpod-volume/workspace/models/verify-model.safetensors",
            root=root,
        )
        run_script("render_model_dockerfile.py", root=root)

        dockerfile = (generator / "Dockerfile").read_text(encoding="utf-8")
        if "ARG CIVITAI_API_TOKEN" in dockerfile:
            fail("Dockerfile must not use CIVITAI_API_TOKEN as a build arg.")
        if "--mount=type=secret,id=civitai_api_token" not in dockerfile:
            fail("Dockerfile migration layers must use the Civitai BuildKit secret.")
        if "/model-migrations/0001-verify-model-1.json" not in dockerfile:
            fail("Rendered Dockerfile did not include the new migration layer.")

        new_manifest = migrations / "0001-verify-model-1.json"
        if not new_manifest.exists():
            fail("Expected migration manifest was not created.")
        payload = json.loads(new_manifest.read_text(encoding="utf-8"))
        if payload["path"] != "/runpod-volume/workspace/models/verify-model.safetensors":
            fail("Migration manifest path was not preserved.")
        if "token=" in payload["url"] or "secret-token" in payload["url"]:
            fail("Migration manifest must not persist Civitai token query params.")
        if payload["url"] != "https://civitai.com/api/download/models/123?foo=bar":
            fail("Migration manifest did not preserve non-secret query params.")

        before = sorted(path.name for path in migrations.glob("*.json"))
        run_script(
            "add_model_migration.py",
            "--id",
            "verify-model-1",
            "--url",
            "https://civitai.com/api/download/models/123",
            "--path",
            "/runpod-volume/workspace/models/verify-model.safetensors",
            root=root,
        )
        after = sorted(path.name for path in migrations.glob("*.json"))
        if before != after:
            fail("Adding the same migration twice must be idempotent.")

        (migrations / "0009-existing-gap.json").write_text(
            json.dumps(
                {
                    "id": "existing-gap",
                    "url": "https://example.com/existing.safetensors",
                    "path": "/runpod-volume/workspace/models/existing.safetensors",
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        run_script(
            "add_model_migration.py",
            "--id",
            "verify-model-2",
            "--url",
            "https://civitai.com/api/download/models/456",
            "--path",
            "/runpod-volume/workspace/models/verify-model-2.safetensors",
            root=root,
        )
        if not (migrations / "0010-verify-model-2.json").exists():
            fail("Migration helper should allocate the next highest numeric prefix, not use file count.")

        invalid = run_script(
            "add_model_migration.py",
            "--id",
            "bad-path",
            "--url",
            "https://example.com/model.safetensors",
            "--path",
            "/etc/passwd",
            root=root,
            check=False,
        )
        if invalid.returncode == 0:
            fail("Migration helper accepted a path outside the allowed model directories.")

        secret_url = run_script(
            "add_model_migration.py",
            "--id",
            "bad-url",
            "--url",
            "https://user:password@example.com/model.safetensors",
            "--path",
            "/runpod-volume/workspace/models/bad-url.safetensors",
            root=root,
            check=False,
        )
        if secret_url.returncode == 0:
            fail("Migration helper accepted a URL with embedded credentials.")

    print("Model migration workflow verification passed.")


if __name__ == "__main__":
    main()
