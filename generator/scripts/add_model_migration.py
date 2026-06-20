import argparse
import json
import os
import re
from pathlib import Path


def repo_root() -> Path:
    override = os.environ.get("GENERATOR_MIGRATION_ROOT")
    if override:
        return Path(override).resolve()
    return Path(__file__).resolve().parents[2]


MIGRATIONS = repo_root() / "generator" / "model-migrations"
ALLOWED_PATH_PREFIXES = ("/defaults/", "/runpod-volume/")


def slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-").lower()


def validate_path(path: str) -> None:
    if not path.startswith(ALLOWED_PATH_PREFIXES):
        raise SystemExit(
            f"Migration path must start with one of {ALLOWED_PATH_PREFIXES}; got {path}"
        )
    if "/../" in path or path.endswith("/.."):
        raise SystemExit(f"Migration path must not contain parent traversal: {path}")


def next_migration_index() -> int:
    highest = -1
    for migration in MIGRATIONS.glob("*.json"):
        prefix = migration.name.split("-", 1)[0]
        if prefix.isdigit():
            highest = max(highest, int(prefix))
    return highest + 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--path", required=True)
    parser.add_argument("--sha256")
    args = parser.parse_args()
    validate_path(args.path)

    MIGRATIONS.mkdir(parents=True, exist_ok=True)
    for existing in MIGRATIONS.glob("*.json"):
        payload = json.loads(existing.read_text(encoding="utf-8"))
        if payload.get("id") == args.id:
            print(existing)
            return

    filename = f"{next_migration_index():04d}-{slug(args.id)}.json"
    target = MIGRATIONS / filename

    if target.exists():
        raise SystemExit(f"Migration already exists: {target}")

    payload = {
        "id": args.id,
        "url": args.url,
        "path": args.path,
    }
    if args.sha256:
        payload["sha256"] = args.sha256

    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
