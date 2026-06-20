from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "model-image-rebuild.yml"


REQUIRED_SNIPPETS = {
    "repository_dispatch trigger": "repository_dispatch:",
    "identifiable workflow run name": "run-name: Model image rebuild",
    "manual workflow dispatch": "workflow_dispatch:",
    "dry-run input": "dryRun:",
    "dry-run payload resolver": "DRY_RUN=",
    "dry-run validation step": "Validate dry-run payload",
    "dry-run side-effect guard": "env.DRY_RUN != 'true'",
    "dry-run skip message": "Skipping migration commit, release, RunPod hook, and manager callback",
    "model image event type": "model-image-rebuild",
    "migration helper": "python generator/scripts/add_model_migration.py",
    "Dockerfile renderer": "python generator/scripts/render_model_dockerfile.py",
    "push retry loop": "for attempt in 1 2 3; do",
    "remote reset before retry": 'git reset --hard "origin/$GITHUB_REF_NAME"',
    "RunPod release creation": "gh release create",
    "RunPod release tag": "RELEASE_TAG",
    "RunPod release integration message": "RunPod GitHub integration should build",
    "custom RunPod build hook": "RUNPOD_BUILD_WEBHOOK_URL",
    "manager callback": "/api/v1/webhooks/model-image",
    "manager callback token": "MANAGER_WEBHOOK_TOKEN",
}


FORBIDDEN_SNIPPETS = {
    "Civitai token as Docker build arg": "CIVITAI_API_TOKEN=${{ secrets.CIVITAI_API_TOKEN }}\n          tags:",
    "old separate non-retry commit step": "name: Add model migration",
    "GitHub-hosted Docker Buildx": "docker/setup-buildx-action",
    "GitHub Docker Hub login": "docker/login-action",
    "GitHub Docker build push": "docker/build-push-action",
    "DockerHub secret dependency": "DOCKERHUB_",
    "direct RunPod template image update": "update_runpod_template.py",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def main() -> None:
    if not WORKFLOW.exists():
        fail(f"Workflow file is missing: {WORKFLOW}")

    source = WORKFLOW.read_text(encoding="utf-8")

    missing = [name for name, snippet in REQUIRED_SNIPPETS.items() if snippet not in source]
    if missing:
        fail("Workflow is missing required pipeline pieces: " + ", ".join(missing))

    forbidden = [name for name, snippet in FORBIDDEN_SNIPPETS.items() if snippet in source]
    if forbidden:
        fail("Workflow contains forbidden legacy pieces: " + ", ".join(forbidden))

    print("Model image workflow verification passed.")


if __name__ == "__main__":
    main()
