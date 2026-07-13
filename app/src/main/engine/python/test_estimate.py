import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parent / "estimate.py"
PROJECT_ROOT = Path(__file__).parents[1] / "benchmarks" / "qsharp-project"


def invocation(**overrides):
    value = {
        "program": {
            "sourcePath": str(PROJECT_ROOT),
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
    value.update(overrides)
    return value


def run_wrapper(value):
    env = os.environ.copy()
    env["QDK_PYTHON_TELEMETRY"] = "none"
    proc = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=json.dumps(value),
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_gate_based_psspc_success_preserves_complete_output():
    result = run_wrapper(invocation())
    assert result["status"] == "success"
    assert len(result["frontier"]) >= 1
    row = result["frontier"][0]
    assert row["qubits"] > 0
    assert row["distance"] is not None
    assert row["logicalCycleTime"] is not None

    assert result["verbatim"]["entries"][0]["qubits"] == row["qubits"]
    assert "source" in result["verbatim"]["entries"][0]
    assert "nodes" in result["verbatim"]["entries"][0]["source"]
    instruction = result["verbatim"]["entries"][0]["source"]["nodes"][0]["instruction"]
    assert {
        "id",
        "name",
        "arity",
        "encoding",
        "source",
        "time",
        "space",
        "error_rate",
        "properties",
        "repr",
    } <= instruction.keys()
    assert "properties" in result["verbatim"]["entries"][0]
    assert result["verbatim"]["stats"]["pareto_results"] >= 1


def test_unsatisfiable_max_error_fails_soft_with_verbatim_diagnostics():
    result = run_wrapper(
        invocation(
            architecture={
                "type": "gateBased",
                "errorRate": 0.0001,
                "gateTime": 100000,
                "measurementTime": 100000,
                "twoQubitGateTime": None,
            },
            maxError=1e-12,
        )
    )
    assert result["status"] == "failed"
    assert result["code"] == "ESTIMATION_FAILED"
    assert result["verbatim"]["entries"] == []
