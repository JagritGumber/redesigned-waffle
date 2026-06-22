from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


FILES = {
    "manager env example": ROOT / "manager" / ".env.example",
    "solid env example": ROOT / "solid" / ".env.example",
    "worker env example": ROOT / "backend" / ".dev.vars.example",
    "worker package": ROOT / "backend" / "package.json",
    "worker readme": ROOT / "backend" / "README.md",
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
    "MODEL_IMAGE_REBUILD_MIRROR_PATH",
    "MODEL_IMAGE_REBUILD_MIRROR_REMOTE",
    "MODEL_IMAGE_REBUILD_MIRROR_BRANCH",
    "MODEL_IMAGE_REBUILD_MIRROR_PUSH",
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
    "MODEL_IMAGE_WEBHOOK_TOKEN",
    "R2_PUBLIC_BUCKET_URL",
    "R2_BUCKET_NAME",
]

REQUIRED_DOC_SNIPPETS = [
    "Stable Self-Host Stack",
    "Cacheable Model Installs",
    "MODEL_IMAGE_REBUILD_PROVIDER=mirror",
    "MODEL_IMAGE_REBUILD_MIRROR_PATH",
    "private deploy mirror",
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
    "`DELETE_FAILED`",
    "`DELETED`",
    "polls account install endpoints",
    "Global model metadata must not be used as the source of truth",
]

REQUIRED_WORKER_DOC_SNIPPETS = [
    "manager backend for private mirror model installs",
    "Cloudflare Workers cannot commit migrations to a local private mirror clone",
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
    worker_readme = read("worker readme")
    operator_pipeline = read("operator pipeline")
    docs = read("readme") + "\n" + read("generator readme")

    assert_keys("manager/.env.example", manager_env, REQUIRED_MANAGER_KEYS)
    assert_keys("solid/.env.example", solid_env, REQUIRED_SOLID_KEYS)
    assert_keys("backend/.dev.vars.example", worker_env, REQUIRED_WORKER_KEYS)

    for snippet in [
        "check:readiness",
        "verify:self-host-readiness",
    ]:
        if snippet not in worker_package:
            fail(f"backend/package.json is missing script: {snippet}")

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

    missing_worker_docs = [
        snippet for snippet in REQUIRED_WORKER_DOC_SNIPPETS if snippet not in worker_readme
    ]
    if missing_worker_docs:
        fail("worker docs are missing required snippets: " + ", ".join(missing_worker_docs))

    if "MODEL_IMAGE_REBUILD_PROVIDER=mirror" not in manager_env:
        fail("manager/.env.example should default model image rebuilds to the private mirror provider.")
    if "MODEL_IMAGE_REBUILD_PROVIDER=" not in worker_env:
        fail("backend/.dev.vars.example should leave Worker model image rebuild provider unset by default.")

    forbidden = [
        "MODEL_IMAGE_REBUILD_GITHUB",
        "MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA",
        "repository_dispatch",
        "GitHub release",
        "model-image-rebuild.yml",
    ]
    combined = manager_env + "\n" + worker_env + "\n" + worker_readme + "\n" + docs
    found = [snippet for snippet in forbidden if snippet in combined]
    if found:
        fail("self-host config/docs still mention removed GitHub release provider snippets: " + ", ".join(found))

    print("Self-host configuration contract verification passed.")


if __name__ == "__main__":
    main()
