#!/usr/bin/env python3
"""Reproduce the real QRE outputs PMs use to verify frozen fixtures."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[4]
WRAPPER = HERE / "estimate.py"
PROJECT = HERE.parent / "benchmarks" / "qsharp-project"
OUTPUT_DIR = REPO_ROOT / "docs" / "week-2" / "team-3" / "qre-output-captures"


def base_invocation() -> dict:
    return {
        "program": {
            "sourcePath": str(PROJECT),
            "format": "qsharp",
            "entryExpr": "QuantumDynamics.Run()",
        },
        "architecture": {
            "type": "gateBased",
            "errorRate": 0.0001,
            "gateTime": 50,
            "measurementTime": 100,
            "twoQubitGateTime": None,
        },
        "qecCode": "surface_code",
        "magicStateFactory": "round_based",
        "traceTransform": {
            "type": "psspc",
            "tStatesPerRotation": 20,
            "ccxMagicStates": False,
        },
        "maxError": 1.0,
        "timeoutMs": 30000,
    }


def cases() -> dict[str, dict]:
    multi_row = base_invocation()
    multi_row["maxError"] = 0.01

    single_row = base_invocation()

    failure = base_invocation()
    failure["program"] = {**failure["program"], "entryExpr": "MissingProgram.Run()"}

    majorana = base_invocation()
    majorana["architecture"] = {
        "type": "majorana",
        "errorRate": 0.00001,
        "operationTime": 1000,
    }
    majorana["qecCode"] = "three_aux"

    lattice_surgery = base_invocation()
    lattice_surgery["traceTransform"] = {
        "type": "latticeSurgery",
        "slowDownFactor": 1.0,
    }

    # Formatting stress combines the widest property set QDK 1.29.1 reports
    # for this adapter with five rows and billion-nanosecond runtime values.
    formatting_stress = base_invocation()
    formatting_stress["architecture"] = {
        "type": "gateBased",
        "errorRate": 0.0001,
        "gateTime": 100000,
        "measurementTime": 100000,
        "twoQubitGateTime": 100000,
    }
    formatting_stress["maxError"] = 0.01

    return {
        "multi-row-gatebased-psspc": multi_row,
        "single-row-gatebased-psspc": single_row,
        "real-compile-failure": failure,
        "majorana-three-aux": majorana,
        "lattice-surgery": lattice_surgery,
        "formatting-stress-wide-frontier": formatting_stress,
    }


def main() -> int:
    python_bin = os.environ.get("QRE_PYTHON_BIN", sys.executable)
    env = os.environ.copy()
    env["QDK_PYTHON_TELEMETRY"] = "none"
    env.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib"))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {
        "qreVersion": None,
        "generatedBy": str(Path(__file__).relative_to(REPO_ROOT)),
        "captures": [],
    }
    for name, invocation in cases().items():
        input_bytes = (json.dumps(invocation, indent=2) + "\n").encode()
        process = subprocess.run(
            [python_bin, str(WRAPPER)],
            input=input_bytes,
            capture_output=True,
            timeout=120,
            env=env,
        )
        if process.returncode != 0:
            raise RuntimeError(process.stderr.decode(errors="replace"))

        output = json.loads(process.stdout)
        (OUTPUT_DIR / f"{name}.input.json").write_bytes(input_bytes)
        # Preserve the wrapper's stdout byte-for-byte, including its newline.
        (OUTPUT_DIR / f"{name}.output.json").write_bytes(process.stdout)
        rows = len(output.get("frontier", []))
        manifest["qreVersion"] = output["qreVersion"]
        manifest["captures"].append({
            "name": name,
            "status": output["status"],
            "errorCode": output.get("code"),
            "frontierRows": rows,
            "input": f"{name}.input.json",
            "verbatimOutput": f"{name}.output.json",
        })
        print(f"{name}: status={output['status']} rows={rows} code={output.get('code')}")

    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
