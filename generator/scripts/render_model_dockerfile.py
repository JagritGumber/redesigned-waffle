import os
from pathlib import Path


def repo_root() -> Path:
    override = os.environ.get("GENERATOR_MIGRATION_ROOT")
    if override:
        return Path(override).resolve()
    return Path(__file__).resolve().parents[2]


ROOT = repo_root()
DOCKERFILE = ROOT / "generator" / "Dockerfile"
MIGRATIONS = ROOT / "generator" / "model-migrations"
BEGIN = "# BEGIN MODEL MIGRATION LAYERS"
END = "# END MODEL MIGRATION LAYERS"


def main() -> None:
    migrations = sorted(MIGRATIONS.glob("*.json"))
    if not migrations:
        raise SystemExit("No model migrations found.")

    lines = [BEGIN]
    for migration in migrations:
        manifest_path = f"/model-migrations/{migration.name}"
        lines.append(
            f"COPY generator/model-migrations/{migration.name} {manifest_path}"
        )
        lines.append(
            "RUN --mount=type=secret,id=civitai_api_token "
            f"python /usr/local/bin/download_model_layer.py --manifest {manifest_path}"
        )
    lines.append(END)

    current = DOCKERFILE.read_text(encoding="utf-8")
    before, rest = current.split(BEGIN, 1)
    _, after = rest.split(END, 1)
    DOCKERFILE.write_text(before + "\n".join(lines) + after, encoding="utf-8")


if __name__ == "__main__":
    main()
