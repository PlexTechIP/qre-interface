"""Independent qdk[qre]==1.29.1 Route B capability probe.

This lives in the Route A spike so it cannot affect the production Python
wrapper or the teammate-owned virtual environment.
"""

from __future__ import annotations

import inspect
import json
import os
import time
from importlib.metadata import version
from pathlib import Path
from typing import Any

os.environ.setdefault("QDK_PYTHON_TELEMETRY", "none")
os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).parent / ".tmp"))

import qdk.qre as qre
import qdk.qre.property_keys as property_keys
from qdk.openqasm import compile as compile_openqasm
from qdk.qre.application import OpenQASMApplication, QIRApplication
from qdk.qre.models import (
    GateBased,
    Litinski19Factory,
    Majorana,
    RoundBasedFactory,
    SurfaceCode,
    ThreeAux,
)


ROOT = Path(__file__).parent
OUTPUT = ROOT / "output-samples" / "python-route-b-report.json"
CACHE = ROOT / ".qre-cache"

OPENQASM = (
    """
OPENQASM 3.0;
include "stdgates.inc";
qubit[3] q;
h q[0];
cx q[0], q[1];
"""
    + "\n".join("h q[0]; t q[0];" for _ in range(500))
    + """
bit[3] c;
c = measure q;
"""
)

CONTRACT_FIELDS = [
    "physicalQubits",
    "runtime",
    "totalError",
    "factories",
    "source",
    "PHYSICAL_COMPUTE_QUBITS",
    "PHYSICAL_FACTORY_QUBITS",
    "PHYSICAL_MEMORY_QUBITS",
    "LOGICAL_COMPUTE_QUBITS",
    "LOGICAL_MEMORY_QUBITS",
    "ALGORITHM_COMPUTE_QUBITS",
    "ALGORITHM_MEMORY_QUBITS",
    "LOGICAL_CYCLE_TIME",
    "CODE_CYCLE_TIME",
    "RUNTIME_SINGLE_SHOT",
    "EXPECTED_SHOTS",
    "EVALUATION_TIME",
    "DISTANCE",
    "NUM_TS_PER_ROTATION",
    "BLOCK_SIZE",
    "FEASIBILITY",
    "LOSS",
    "TARGET_YEAR",
    "NAME",
    "ASSUMPTIONS",
    "BASE_SYSTEM_COST",
    "SHOT_COST",
    "COST_PER_QUBIT",
    "COST_PER_HOUR",
    "COST_PER_QUBIT_PER_HOUR",
    "ATOM_SPACING",
    "DATA_QUBIT_SPACING",
    "VELOCITY",
    "ACCELERATION",
    "SURFACE_CODE_ONE_QUBIT_TIME_FACTOR",
    "SURFACE_CODE_TWO_QUBIT_TIME_FACTOR",
    "MOLECULE",
]


def jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if type(value).__name__ == "FactoryResult":
        return {
            "copies": value.copies,
            "runs": value.runs,
            "errorRate": value.error_rate,
            "states": value.states,
        }
    if hasattr(value, "__dict__"):
        return {
            "type": type(value).__name__,
            **{k: jsonable(v) for k, v in vars(value).items() if not k.startswith("_")},
        }
    return repr(value)


PROPERTY_IDS = {
    name: getattr(property_keys, name)
    for name in dir(property_keys)
    if name.isupper() and name != "CUSTOM_PROPERTY"
}
PROPERTY_NAMES = {value: name for name, value in PROPERTY_IDS.items()}


def instruction_properties(instruction: Any) -> dict[str, Any]:
    found: dict[str, Any] = {}
    for name, key in PROPERTY_IDS.items():
        value = instruction.get_property_or(key, None)
        if value is not None:
            found[name] = jsonable(value)
    return found


def source_nodes(entry: Any) -> list[dict[str, Any]]:
    result = []
    for node in entry.source.nodes:
        props = instruction_properties(node.instruction)
        if props:
            result.append(
                {
                    "transform": type(node.transform).__name__,
                    "instructionId": node.instruction.id,
                    "instructionName": qre.instruction_name(node.instruction.id),
                    "properties": props,
                }
            )
    return result


def serialize_entry(entry: Any) -> dict[str, Any]:
    direct_properties = {
        PROPERTY_NAMES.get(key, str(key)): jsonable(value)
        for key, value in entry.properties.items()
    }
    return {
        "qubits": entry.qubits,
        "runtime": entry.runtime,
        "error": entry.error,
        "factories": jsonable(entry.factories),
        "properties": direct_properties,
        "sourcePropertyNodes": source_nodes(entry),
    }


def run_case(
    name: str,
    application: Any,
    architecture: Any,
    isa: Any,
    trace: Any,
    max_error: float = 1.0,
) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        table = qre.estimate(
            application,
            architecture,
            isa,
            trace,
            max_error=max_error,
        )
        return {
            "name": name,
            "ok": True,
            "elapsedSeconds": time.perf_counter() - started,
            "maxError": max_error,
            "frontierRows": len(table),
            "rows": [serialize_entry(entry) for entry in table],
        }
    except Exception as error:  # evidence must preserve native failure details
        return {
            "name": name,
            "ok": False,
            "elapsedSeconds": time.perf_counter() - started,
            "maxError": max_error,
            "errorType": type(error).__name__,
            "error": str(error),
        }


def main() -> None:
    CACHE.mkdir(exist_ok=True)
    qir_text = str(compile_openqasm(OPENQASM))

    round_based = RoundBasedFactory.q(cache_dir=CACHE / "round-based", use_cache=True)
    surface_round = SurfaceCode.q() * round_based

    cases = [
        run_case(
            "openqasm-gate-surface-round-psspc-lattice-surgery",
            OpenQASMApplication(OPENQASM),
            GateBased(error_rate=1e-4, gate_time=50, measurement_time=100),
            surface_round,
            qre.PSSPC.q(num_ts_per_rotation=20, ccx_magic_states=False)
            * qre.LatticeSurgery.q(slow_down_factor=1.0),
        ),
        run_case(
            "openqasm-gate-surface-litinski19-lattice-surgery",
            OpenQASMApplication(OPENQASM),
            GateBased(error_rate=1e-4, gate_time=50, measurement_time=100),
            SurfaceCode.q() * Litinski19Factory.q(),
            qre.PSSPC.q(num_ts_per_rotation=20, ccx_magic_states=False)
            * qre.LatticeSurgery.q(slow_down_factor=1.0),
        ),
        run_case(
            "openqasm-majorana-three-aux-round-psspc-lattice-surgery",
            OpenQASMApplication(OPENQASM),
            Majorana(error_rate=1e-6),
            ThreeAux.q() * round_based,
            qre.PSSPC.q(num_ts_per_rotation=20, ccx_magic_states=False)
            * qre.LatticeSurgery.q(slow_down_factor=1.0),
        ),
        run_case(
            "qir-gate-surface-round-psspc-lattice-surgery",
            QIRApplication(input=qir_text),
            GateBased(error_rate=1e-4, gate_time=50, measurement_time=100),
            surface_round,
            qre.PSSPC.q(num_ts_per_rotation=20, ccx_magic_states=False)
            * qre.LatticeSurgery.q(slow_down_factor=1.0),
        ),
        run_case(
            "openqasm-gate-surface-round-psspc-lattice-surgery-tight-max-error",
            OpenQASMApplication(OPENQASM),
            GateBased(error_rate=1e-4, gate_time=50, measurement_time=100),
            surface_round,
            qre.PSSPC.q(num_ts_per_rotation=20, ccx_magic_states=False)
            * qre.LatticeSurgery.q(slow_down_factor=1.0),
            max_error=0.01,
        ),
    ]

    native_fields = {
        "physicalQubits",
        "runtime",
        "totalError",
        "factories",
        *PROPERTY_IDS.keys(),
    }
    report = {
        "qdkVersion": version("qdk"),
        "qsharpVersion": version("qsharp"),
        "python": os.sys.version,
        "exports": {
            name: {
                "present": True,
                "signature": str(inspect.signature(value)),
            }
            for name, value in {
                "GateBased": GateBased,
                "Majorana": Majorana,
                "SurfaceCode": SurfaceCode,
                "ThreeAux": ThreeAux,
                "RoundBasedFactory": RoundBasedFactory,
                "Litinski19Factory": Litinski19Factory,
                "PSSPC": qre.PSSPC,
                "LatticeSurgery": qre.LatticeSurgery,
                "QIRApplication": QIRApplication,
            }.items()
        },
        "qir": {
            "compiledFromOpenQasm": True,
            "characters": len(qir_text),
            "startsWith": qir_text[:100],
        },
        "contractFieldCoverage": {
            "contractFieldCount": len(CONTRACT_FIELDS),
            "nativeFieldCount": len(native_fields & set(CONTRACT_FIELDS)),
            "nativeFields": sorted(native_fields & set(CONTRACT_FIELDS)),
            "missingNativeFields": sorted(set(CONTRACT_FIELDS) - native_fields),
        },
        "cases": cases,
    }
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
