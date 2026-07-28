#!/usr/bin/env python3
"""JSON-lines boundary around qdk.qre.estimate.

The process writes exactly one JSON object to stdout. Engine failures are data,
not process failures. ``verbatim`` is the lossless JSON representation of every
field exposed by qdk's EstimationTable, entries, source graph, and factories;
``frontier`` is the deliberately tidy adapter projection.
"""

from __future__ import annotations

import importlib.metadata
import json
import sys
from dataclasses import fields, is_dataclass
from pathlib import Path
from typing import Any

import qdk
import qdk.qre as qre
from qsharp import QSharpError
from qdk.qre import LatticeSurgery, PSSPC, instruction_name
from qdk.qre.application import OpenQASMApplication, QIRApplication, QSharpApplication
from qdk.qre.models import (
    GateBased,
    Litinski19Factory,
    Majorana,
    RoundBasedFactory,
    SurfaceCode,
    ThreeAux,
)
from qdk.qre import property_keys
from qdk.qre.property_keys import CODE_CYCLE_TIME, DISTANCE


PROPERTY_IDS = {
    name: getattr(property_keys, name)
    for name in dir(property_keys)
    if name.isupper() and name != "CUSTOM_PROPERTY"
}
PROPERTY_NAMES = {value: name for name, value in PROPERTY_IDS.items()}
ROUND_BASED_CACHE = Path(__file__).parent / ".qre-cache" / "round-based"
MISSING_PROPERTY = 2**63 - 1


def failure_code_for(exc: Exception) -> str:
    """Classify compiler failures by QDK's structured exception type."""
    return "COMPILE_ERROR" if isinstance(exc, QSharpError) else "ESTIMATION_FAILED"


def _public_slots(value: Any) -> list[str]:
    slots = getattr(type(value), "__slots__", ())
    if isinstance(slots, str):
        slots = (slots,)
    return [name for name in slots if not name.startswith("_") and hasattr(value, name)]


def jsonable(value: Any) -> Any:
    """Convert qdk-exposed values without pruning public fields."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    if type(value).__name__ == "FactoryResult":
        return {
            "copies": value.copies,
            "runs": value.runs,
            "error_rate": value.error_rate,
            "states": value.states,
        }
    if is_dataclass(value):
        return {field.name: jsonable(getattr(value, field.name)) for field in fields(value)}
    if slots := _public_slots(value):
        return {name: jsonable(getattr(value, name)) for name in slots}
    if hasattr(value, "__dict__"):
        return {
            key: jsonable(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return repr(value)


def build_application(program: dict[str, Any]):
    fmt = program["format"]
    if fmt == "qsharp":
        qdk.init(project_root=program["sourcePath"])
        return QSharpApplication(entry_expr=program["entryExpr"])
    if fmt == "openqasm":
        with open(program["sourcePath"], "r", encoding="utf-8") as source:
            return OpenQASMApplication(program=source.read())
    if fmt == "qir":
        with open(program["sourcePath"], "r", encoding="utf-8") as source:
            return QIRApplication(input=source.read())
    raise ValueError(f"Unknown program format: {fmt}")


def build_architecture(architecture: dict[str, Any]):
    if architecture["type"] == "gateBased":
        return GateBased(
            error_rate=architecture["errorRate"],
            gate_time=architecture["gateTime"],
            measurement_time=architecture["measurementTime"],
            two_qubit_gate_time=architecture.get("twoQubitGateTime"),
        )
    return Majorana(error_rate=architecture["errorRate"])


def build_isa_query(qec_code: str, magic_state_factory: str):
    qec = SurfaceCode.q() if qec_code == "surface_code" else ThreeAux.q()
    factory = (
        Litinski19Factory.q()
        if magic_state_factory == "litinski19"
        else RoundBasedFactory.q(cache_dir=ROUND_BASED_CACHE, use_cache=True)
    )
    return qec * factory


def build_trace_query(trace_transform: dict[str, Any]):
    if trace_transform["type"] == "psspc":
        return PSSPC.q(
            num_ts_per_rotation=trace_transform["tStatesPerRotation"],
            ccx_magic_states=trace_transform["ccxMagicStates"],
        ) * LatticeSurgery.q(slow_down_factor=1.0)
    return PSSPC.q() * LatticeSurgery.q(
        slow_down_factor=trace_transform["slowDownFactor"]
    )


def instruction_properties(instruction: Any) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    for name, key in PROPERTY_IDS.items():
        value = instruction.get_property_or(key, MISSING_PROPERTY)
        if value != MISSING_PROPERTY:
            properties[str(key)] = jsonable(value)
    return properties


def serialize_source(source: Any) -> dict[str, Any]:
    return {
        "roots": list(source.roots),
        "nodes": [
            {
                "instruction": {
                    "id": node.instruction.id,
                    "name": instruction_name(node.instruction.id),
                    "arity": node.instruction.arity,
                    "encoding": node.instruction.encoding,
                    "source": node.instruction.source,
                    "time": node.instruction.time(),
                    "space": node.instruction.space(),
                    "error_rate": node.instruction.error_rate(),
                    "properties": instruction_properties(node.instruction),
                    "repr": repr(node.instruction),
                },
                "transform": None
                if node.transform is None
                else {
                    "type": type(node.transform).__name__,
                    "value": jsonable(node.transform),
                    "repr": repr(node.transform),
                },
                "children": list(node.children),
            }
            for node in source.nodes
        ],
    }


def serialize_entry(entry: Any) -> dict[str, Any]:
    return {
        "qubits": entry.qubits,
        "runtime": entry.runtime,
        "error": entry.error,
        "source": serialize_source(entry.source),
        "factories": {str(key): jsonable(value) for key, value in entry.factories.items()},
        "properties": {str(key): jsonable(value) for key, value in entry.properties.items()},
    }


def serialize_stats(stats: Any) -> dict[str, Any]:
    return {field.name: jsonable(getattr(stats, field.name)) for field in fields(stats)}


def find_qec_property(entry: Any, key: int, default: Any = None) -> Any:
    for node in entry.source.nodes:
        if type(node.transform).__name__ in ("SurfaceCode", "ThreeAux"):
            value = node.instruction.get_property_or(key, MISSING_PROPERTY)
            if value != MISSING_PROPERTY:
                return value
    return default


def entry_to_dict(entry: Any, source_format: str) -> dict[str, Any]:
    distance = find_qec_property(entry, DISTANCE)
    code_cycle_time = find_qec_property(entry, CODE_CYCLE_TIME)
    logical_cycle_time = (
        distance * code_cycle_time
        if distance is not None and code_cycle_time is not None
        else None
    )
    return {
        "qubits": entry.qubits,
        "runtime": entry.runtime,
        "error": entry.error,
        "distance": distance,
        "codeCycleTime": code_cycle_time,
        "logicalCycleTime": logical_cycle_time,
        "factories": [
            {
                "stateType": instruction_name(instruction_id) or str(instruction_id),
                "copies": result.copies,
            }
            for instruction_id, result in entry.factories.items()
        ],
        "source": source_format,
        "properties": {
            PROPERTY_NAMES.get(key, str(key)): jsonable(value)
            for key, value in entry.properties.items()
        },
    }


def qre_version() -> str:
    return importlib.metadata.version("qdk")


def failure(code: str, message: str, verbatim: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "failed",
        "code": code,
        "message": message,
        "verbatim": verbatim,
        "qreVersion": qre_version(),
    }


def main() -> int:
    try:
        invocation = json.loads(sys.stdin.read())
        application = build_application(invocation["program"])
        architecture = build_architecture(invocation["architecture"])
        isa_query = build_isa_query(invocation["qecCode"], invocation["magicStateFactory"])
        trace_query = build_trace_query(invocation["traceTransform"])
        table = qre.estimate(
            application,
            architecture,
            isa_query,
            trace_query,
            max_error=invocation["maxError"],
        )
        verbatim = {
            "entries": [serialize_entry(entry) for entry in table],
            "stats": serialize_stats(table.stats),
            "name": table.name,
        }
        if not table:
            print(json.dumps(failure(
                "ESTIMATION_FAILED",
                "The estimator found no feasible Pareto frontier point; relax maxError or adjust the model.",
                verbatim,
            )))
            return 0

        print(json.dumps({
            "status": "success",
            "engineApi": "qdk-qre-estimate",
            "frontier": [entry_to_dict(entry, invocation["program"]["format"]) for entry in table],
            "verbatim": verbatim,
            "qreVersion": qre_version(),
        }))
        return 0
    except Exception as exc:  # The subprocess boundary must fail soft.
        diagnostic = str(exc)
        exc_type = type(exc).__name__
        error_code = failure_code_for(exc)
        compile_error = error_code == "COMPILE_ERROR"
        detail = diagnostic or exc_type
        message = (
            f"{detail} Check the program source and entry point, then retry."
            if compile_error
            else f"{detail} Review the raw diagnostics, adjust the configuration, and retry."
        )
        print(json.dumps(failure(
            error_code,
            message,
            {"error": {"type": exc_type, "message": diagnostic}},
        )))
        return 0


if __name__ == "__main__":
    sys.exit(main())
