import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


FAST_CHECKS = [
    ("self-host contract", [sys.executable, "generator/scripts/verify_self_host_contract.py"], ROOT),
    ("model image workflow", [sys.executable, "generator/scripts/verify_model_image_workflow.py"], ROOT),
    ("model migrations", [sys.executable, "generator/scripts/verify_model_migrations.py"], ROOT),
    (
        "generator scripts compile",
        [
            sys.executable,
            "-m",
            "py_compile",
            "generator/scripts/download_model_layer.py",
            "generator/scripts/render_model_dockerfile.py",
            "generator/scripts/add_model_migration.py",
            "generator/scripts/report_model_image_status.py",
            "generator/scripts/verify_model_migrations.py",
            "generator/scripts/verify_model_image_workflow.py",
            "generator/scripts/verify_self_host_contract.py",
            "generator/scripts/verify_local_pipeline.py",
        ],
        ROOT,
    ),
    ("manager health route", ["bun", "run", "verify:health"], ROOT / "manager"),
    ("manager model image status", ["bun", "run", "verify:model-image-status"], ROOT / "manager"),
    ("manager model image webhook", ["bun", "run", "verify:model-image-webhook"], ROOT / "manager"),
    (
        "manager runpod build polling",
        ["bun", "run", "verify:runpod-build-polling"],
        ROOT / "manager",
    ),
    (
        "manager model image pipeline contract",
        ["bun", "run", "verify:model-image-pipeline"],
        ROOT / "manager",
    ),
    (
        "manager external model pipeline checker",
        ["bun", "run", "verify:external-model-pipeline"],
        ROOT / "manager",
    ),
    (
        "manager account-scoped models",
        ["bun", "run", "verify:account-scoped-models"],
        ROOT / "manager",
    ),
    (
        "manager model install lifecycle",
        ["bun", "run", "verify:model-install-lifecycle"],
        ROOT / "manager",
    ),
    (
        "manager generation model readiness",
        ["bun", "run", "verify:generation-model-readiness"],
        ROOT / "manager",
    ),
    (
        "manager account-scoped models db",
        ["bun", "run", "verify:account-scoped-models:db"],
        ROOT / "manager",
    ),
    (
        "manager account-scoped models api",
        ["bun", "run", "verify:account-scoped-models:api"],
        ROOT / "manager",
    ),
    (
        "manager self-host readiness",
        ["bun", "run", "verify:self-host-readiness"],
        ROOT / "manager",
    ),
    ("worker health route", ["bun", "run", "verify:health"], ROOT / "backend"),
    ("worker model image status", ["bun", "run", "verify:model-image-status"], ROOT / "backend"),
    ("worker model image webhook", ["bun", "run", "verify:model-image-webhook"], ROOT / "backend"),
    (
        "worker runpod build polling",
        ["bun", "run", "verify:runpod-build-polling"],
        ROOT / "backend",
    ),
    (
        "worker account-scoped models",
        ["bun", "run", "verify:account-scoped-models"],
        ROOT / "backend",
    ),
    (
        "worker model install lifecycle",
        ["bun", "run", "verify:model-install-lifecycle"],
        ROOT / "backend",
    ),
    (
        "worker generation model readiness",
        ["bun", "run", "verify:generation-model-readiness"],
        ROOT / "backend",
    ),
    (
        "solid model install status",
        ["bun", "run", "verify:model-install-status"],
        ROOT / "solid",
    ),
]

FULL_CHECKS = [
    ("manager build", ["bun", "run", "build"], ROOT / "manager"),
    ("solid build", ["bun", "run", "build"], ROOT / "solid"),
    ("worker dry-run deploy", ["bun", "run", "deploy", "--dry-run"], ROOT / "backend"),
    ("git diff whitespace", ["git", "diff", "--check"], ROOT),
]


def run_check(name: str, command: list[str], cwd: Path) -> None:
    print(f"==> {name}")
    resolved = command[:]
    executable = shutil.which(resolved[0])
    if executable:
        resolved[0] = executable
    subprocess.run(resolved, cwd=cwd, check=True)


def cleanup_full_artifacts() -> None:
    server_exe = ROOT / "manager" / "server.exe"
    if server_exe.exists():
        server_exe.unlink()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--full",
        action="store_true",
        help="Also build manager/Solid, dry-run Worker deploy, and run git diff --check.",
    )
    args = parser.parse_args()

    try:
        for name, command, cwd in FAST_CHECKS:
            run_check(name, command, cwd)

        if args.full:
            for name, command, cwd in FULL_CHECKS:
                run_check(name, command, cwd)
    finally:
        cleanup_full_artifacts()

    print("Local pipeline verification passed.")


if __name__ == "__main__":
    main()
