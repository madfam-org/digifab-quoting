#!/usr/bin/env python3
"""Validate production workloads fail closed on the shared runtime Secret."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_DIR = ROOT / "infra" / "k8s" / "production"
WORKLOADS = (
    "api-deployment.yaml",
    "web-deployment.yaml",
    "worker-deployment.yaml",
)


def main() -> int:
    failures: list[str] = []
    for name in WORKLOADS:
        manifest = (PRODUCTION_DIR / name).read_text()
        if "name: digifab-quoting-secrets" not in manifest:
            failures.append(f"{name}: missing digifab-quoting-secrets envFrom")
        if "optional: false" not in manifest:
            failures.append(
                f"{name}: digifab-quoting-secrets must set optional: false"
            )

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1

    print("PASS production runtime secret refs are fail-closed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
