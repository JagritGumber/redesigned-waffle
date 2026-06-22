from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


FILES = {
    "manager env example": ROOT / "manager" / ".env.example",
    "solid env example": ROOT / "solid" / ".env.example",
    "worker env example": ROOT / "backend" / ".dev.vars.example",
    "worker package": ROOT / "backend" / "package.json",
    "workflow": ROOT / ".github" / "workflows" / "model-image-rebuild.yml",
    "readme": ROOT / "README.md",
    "operator pipeline": ROOT / "docs" / "operator-model-pipeline.md",
    "generator readme": ROOT / "generator" / "README.md",
}


REQUIRED_MANAGER_KEYS = [
    "HOST_URL",
    "FRONTEND_URL",
    "RUNPOD_API_KEY",
    "RUNPOD_GENERATOR_ID",
    "MODEL_IMAGE_RUNPOD_BUILD_POLLING",
    "RUNPOD_WEBHOOK_URL",
    "MODEL_IMAGE_REBUILD_PROVIDER",
    "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY",
    "MODEL_IMAGE_REBUILD_GITHUB_TOKEN",
    "MODEL_IMAGE_REBUILD_WEBHOOK_URL",
    "MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN",
    "MODEL_IMAGE_WEBHOOK_TOKEN",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_BUCKET_URL",
    "R2_BUCKET_NAME",
]

REQUIRED_SOLID_KEYS = [
    "VITE_BACKEND_URL",
    "VITE_CIVITAI_API_TOKEN",
]

REQUIRED_WORKER_KEYS = [
    "AUTH_SECRET",
    "RUNPOD_API_KEY",
    "RUNPOD_GENERATOR_ID",
    "RUNPOD_WEBHOOK_URL",
    "MODEL_IMAGE_RUNPOD_BUILD_POLLING",
    "MODEL_IMAGE_REBUILD_PROVIDER",
    "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY",
    "MODEL_IMAGE_REBUILD_GITHUB_TOKEN",
    "MODEL_IMAGE_WEBHOOK_TOKEN",
    "R2_PUBLIC_BUCKET_URL",
    "R2_BUCKET_NAME",
]

REQUIRED_WORKFLOW_SECRETS = [
    "MANAGER_WEBHOOK_URL",
    "MANAGER_WEBHOOK_TOKEN",
]

REQUIRED_DOC_SNIPPETS = [
    "Stable Self-Host Stack",
    "Cacheable Model Installs",
    "MODEL_IMAGE_REBUILD_PROVIDER=github",
    "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY",
    "MODEL_IMAGE_REBUILD_GITHUB_TOKEN",
    "RunPod GitHub integration",
    "GitHub release",
    "RunPod Builds tab",
    "polls RunPod's endpoint builds once per minute",
    "Cloudflare Cron Triggers",
    "30 minute Docker build step timeout",
    "80 GB image size limit",
    "/api/v1/webhooks/model-image",
    "report_model_image_status.py",
    "--status COMPLETED",
    "bun run check:readiness",
    "Self-host Worker readiness",
    "bun run verify:pipeline",
    "bun run verify:pipeline:full",
]

REQUIRED_OPERATOR_PIPELINE_SNIPPETS = [
    "`REGISTERING`",
    "`DOWNLOADING`",
    "`BUILD_QUEUED`",
    "`BUILDING`",
    "`READY`",
    "`DOWNLOAD_FAILED`",
    "`BUILD_FAILED`",
    "`DELETED`",
    "polls account install endpoints",
    "Global model metadata must not be used as the source of truth",
]

FORBIDDEN_OPERATOR_PIPELINE_SNIPPETS = [
    "`QUEUED`",
    "`DOWNLOADED`",
    "`DEPLOYING`",
    "`FAILED`",
]


def fail(message: str) -> None:
    raise SystemExit(message)


def read(name: str) -> str:
    path = FILES[name]
    if not path.exists():
        fail(f"Missing required self-host file: {path}")
    return path.read_text(encoding="utf-8")


def assert_keys(name: str, source: str, keys: list[str]) -> None:
    missing = [key for key in keys if f"{key}=" not in source]
    if missing:
        fail(f"{name} is missing keys: {', '.join(missing)}")


def main() -> None:
    manager_env = read("manager env example")
    solid_env = read("solid env example")
    worker_env = read("worker env example")
    worker_package = read("worker package")
    workflow = read("workflow")
    operator_pipeline = read("operator pipeline")
    docs = read("readme") + "\n" + read("generator readme")

    assert_keys("manager/.env.example", manager_env, REQUIRED_MANAGER_KEYS)
    assert_keys("solid/.env.example", solid_env, REQUIRED_SOLID_KEYS)
    assert_keys("backend/.dev.vars.example", worker_env, REQUIRED_WORKER_KEYS)

    for snippet in ["check:readiness", "verify:self-host-readiness"]:
        if snippet not in worker_package:
            fail(f"backend/package.json is missing script: {snippet}")

    missing_secrets = [
        secret for secret in REQUIRED_WORKFLOW_SECRETS if f"secrets.{secret}" not in workflow
    ]
    if missing_secrets:
        fail("model-image workflow is missing secrets: " + ", ".join(missing_secrets))

    missing_docs = [snippet for snippet in REQUIRED_DOC_SNIPPETS if snippet not in docs]
    if missing_docs:
        fail("self-host docs are missing required snippets: " + ", ".join(missing_docs))

    missing_operator_docs = [
        snippet for snippet in REQUIRED_OPERATOR_PIPELINE_SNIPPETS if snippet not in operator_pipeline
    ]
    if missing_operator_docs:
        fail(
            "operator pipeline docs are missing required snippets: "
            + ", ".join(missing_operator_docs)
        )

    forbidden_operator_docs = [
        snippet for snippet in FORBIDDEN_OPERATOR_PIPELINE_SNIPPETS if snippet in operator_pipeline
    ]
    if forbidden_operator_docs:
        fail(
            "operator pipeline docs mention unsupported status snippets: "
            + ", ".join(forbidden_operator_docs)
        )

    if "MODEL_IMAGE_REBUILD_PROVIDER=github" not in manager_env:
        fail("manager/.env.example should default model image rebuilds to GitHub provider.")

    print("Self-host configuration contract verification passed.")


if __name__ == "__main__":
    main()
