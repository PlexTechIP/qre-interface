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
from qdk.qre import (
    DynamicMemoryCompute,
    EvictionStrategy,
    LatticeSurgery,
    PSSPC,
    Unmemory,
    instruction_name,
)
from qdk.estimator import LogicalCounts
from qdk.qre.application import OpenQASMApplication, QIRApplication, QSharpApplication
from qdk.qre.models import (
    GateBased,
    GSJ24CCXFactory,
    GSJ24Factory,
    Litinski19Factory,
    MagicUpToClifford,
    Majorana,
    NeutralAtom,
    RoundBasedFactory,
    SurfaceCode,
    SurfaceCodeLowMove,
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


class InvalidInvocation(ValueError):
    """The invocation parsed, but describes a model qdk should never be handed.

    A distinct type, rather than a bare ValueError, so `failure_code_for` can
    report INVALID_CONFIG: nothing was estimated, and the analyst's next step is
    to correct a field rather than relax a bound or read a qdk traceback.
    """


def failure_code_for(exc: Exception) -> str:
    """Classify failures by structured exception type."""
    if isinstance(exc, InvalidInvocation):
        return "INVALID_CONFIG"
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
    if fmt == "logicalCounts":
        # Manual Logical Counts: no source to compile. QSharpApplication accepts
        # a LogicalCounts as its entry_expr; qdk builds the Trace straight from
        # the counts, skipping Q# compilation entirely. The seven keys map 1:1.
        counts = program["logicalCounts"]
        return QSharpApplication(entry_expr=LogicalCounts(counts))
    raise ValueError(f"Unknown program format: {fmt}")
 
 
# Majorana `t_error_rate`, mirroring runconfig.schema.json and
# configToInvocation. 0.05 is not an arbitrary cap: it is the LARGEST value
# qdk's own `Majorana.__post_init__` ever derives (error_rate 1e-4 -> 0.05,
# 1e-5 -> 0.015, 1e-6 -> 0.01), so the bound is the edge of the regime qdk
# models rather than a house rule.
T_ERROR_RATE_ABOVE = 0
T_ERROR_RATE_AT_MOST = 0.05


def checked_optional_rate(value: Any, label: str, *, above: float, at_most: float):
    """Range-check an optional error rate on the way into a qdk model.

    `None` — absent, or an explicit JSON null — is returned unchanged. Absent
    means "let qdk derive it", and substituting a value here would run a
    configuration the saved record does not describe.

    This exists because qdk does NOT check the values it is given.
    `Majorana.__post_init__` only DERIVES `t_error_rate` when the field is
    `None`; a value that is already there is passed through untouched, and
    `provided_isa` casts it straight onto the `T` instruction's error rate.
    Measured on qdk 1.30.0, `t_error_rate=0.9` and `t_error_rate=-0.1` are both
    accepted and used verbatim — a typo becomes a confident, meaningless
    estimate. Without this check `configToInvocation`'s identical range test is
    the only thing in the way, which makes it load-bearing rather than
    defensive: a config reaching the engine any other way is unguarded.
    """
    if value is None:
        return None
    # `bool` is a subclass of `int` in Python, so without this `0 < True <=
    # 0.05` would quietly admit `true` as a rate of 1.0.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidInvocation(
            f"{label} must be a number in ({above}, {at_most}], got {value!r}."
        )
    # A BOUNDED comparison is also what rejects the non-standard `NaN` /
    # `Infinity` literals that json.loads accepts by default: every comparison
    # against NaN is False, and the infinities fall outside any finite bound. No
    # separate isfinite() check is needed while `at_most` is finite.
    number = float(value)
    if not above < number <= at_most:
        raise InvalidInvocation(f"{label} must be in ({above}, {at_most}], got {value!r}.")
    return number


def build_architecture(architecture: dict[str, Any]):
    arch_type = architecture["type"]
    if arch_type == "gateBased":
        return GateBased(
            error_rate=architecture["errorRate"],
            gate_time=architecture["gateTime"],
            measurement_time=architecture["measurementTime"],
            two_qubit_gate_time=architecture.get("twoQubitGateTime"),
        )
    if arch_type == "majorana":
        # `time` is the contract's "Operation Time" (features-and-fields.md).
        # QDK's default and the UI default are both 1000, so mapping it is
        # output-identical for every existing run; the only behaviour it changes
        # is the case that is wrong today, where a user types 250 and silently
        # gets the answer for 1000.
        #
        # v1.4.0 adds `t_error_rate` and `target_year`, both optional in the
        # contract and both `Optional[...] = None` on the model. Passing None for
        # an absent field is therefore identical to not passing it at all, which
        # is what keeps this additive for every pre-v1.4.0 record.
        #
        # `t_error_rate` is range-checked HERE as well as in configToInvocation,
        # because qdk validates neither — see `checked_optional_rate`.
        return Majorana(
            error_rate=architecture["errorRate"],
            time=architecture["operationTime"],
            t_error_rate=checked_optional_rate(
                architecture.get("tErrorRate"),
                "Majorana tErrorRate",
                above=T_ERROR_RATE_ABOVE,
                at_most=T_ERROR_RATE_AT_MOST,
            ),
            target_year=architecture.get("targetYear"),
        )
    if arch_type == "neutralAtom":
        # Field names follow the 1.30.0 NeutralAtom model. Times are integer
        # nanoseconds; the three error rates and the motion parameters map 1:1
        # from the contract's Neutral Atom variant (QPU Specification tab).
        #
        # v1.4.0's `data_qubit_spacing` is NOT Optional on the model — it
        # defaults to 12.0 — so an absent contract value must OMIT the kwarg
        # rather than pass None. Omitting also avoids duplicating qdk's default
        # here, where it would silently pin the old value if qdk ever changed it.
        optional: dict[str, Any] = {}
        if architecture.get("dataQubitSpacing") is not None:
            optional["data_qubit_spacing"] = architecture["dataQubitSpacing"]

        return NeutralAtom(
            rydberg_time=architecture["rydbergTime"],
            rydberg_error=architecture["rydbergError"],
            one_qubit_time=architecture["singleQubitTime"],
            one_qubit_error=architecture["singleQubitError"],
            measurement_time=architecture["measurementTime"],
            measurement_error=architecture["measurementError"],
            handoff_time=architecture["handoffTime"],
            atom_spacing=architecture["atomSpacing"],
            max_velocity=architecture["maxVelocity"],
            max_acceleration=architecture["maxAcceleration"],
            surface_code_one_qubit_time_factor=architecture["surfaceCodeOneQubitTimeFactor"],
            surface_code_two_qubit_time_factor=architecture["surfaceCodeTwoQubitTimeFactor"],
            target_year=architecture.get("targetYear"),
            **optional,
        )
    raise ValueError(f"Unknown architecture type: {arch_type}")
 
 
def build_qec(qec_code: str):
    if qec_code == "surface_code":
        return SurfaceCode.q()
    if qec_code == "three_aux":
        return ThreeAux.q()
    if qec_code == "low_move_surface_code":
        return SurfaceCodeLowMove.q()
    raise ValueError(f"Unknown QEC code: {qec_code}")
 
 
def build_primary_factory(magic_state_factory: str):
    if magic_state_factory == "litinski19":
        return Litinski19Factory.q()
    if magic_state_factory == "gsj24":
        return GSJ24Factory.q()
    if magic_state_factory == "round_based":
        return RoundBasedFactory.q(cache_dir=ROUND_BASED_CACHE, use_cache=True)
    raise ValueError(f"Unknown magic state factory: {magic_state_factory}")


def build_primary_factory_query(magic_state_factories: list[str]):
    """Union the selected primary factories into a single ISA query.

    ``_ComponentQuery.__add__`` is documented as a union: enumerating ``a + b``
    yields the ISAs of both. So ``qec * (f1 + f2)`` makes the estimator explore
    every selected factory and return ONE Pareto frontier across all of them --
    not one frontier per factory, and not a silently-picked winner.
    """
    if not magic_state_factories:
        raise ValueError("At least one magic state factory is required.")
    query = build_primary_factory(magic_state_factories[0])
    for factory in magic_state_factories[1:]:
        query = query + build_primary_factory(factory)
    return query
 
 
def build_isa_query(
    qec_code: str,
    magic_state_factories: list[str],
    secondary_factories: list[str] | None = None,
):
    qec = build_qec(qec_code)
    query = qec * build_primary_factory_query(magic_state_factories)
    # Secondary factories are layered onto the primary factories. They are an
    # independent multi-select set; order does not matter to the product.
    for secondary in secondary_factories or []:
        if secondary == "magic_up_to_clifford":
            query = query * MagicUpToClifford.q()
        elif secondary == "gsj24_ccx":
            query = query * GSJ24CCXFactory.q()
        else:
            raise ValueError(f"Unknown secondary factory: {secondary}")
    return query
 
 
# Contract id -> the qdk enum MEMBER NAME. Deliberately strings, resolved at
# call time rather than at import: dereferencing EvictionStrategy.<MEMBER> at
# module scope means a member qdk renames in a future release raises at import,
# before main() runs, and every run — benchmark, uploaded, manual counts — comes
# back ENGINE_CRASH. That is the shape of the 1.29.1 `LogicalCounts` import
# defect; keeping this lazy confines the blast radius to the one stage that
# actually uses it.
EVICTION_STRATEGY_MEMBERS = {
    "least_recently_used": "LEAST_RECENTLY_USED",
    "least_frequently_used": "LEAST_FREQUENTLY_USED",
    "first_available": "FIRST_AVAILABLE",
}


def resolve_eviction_strategy(name: str):
    """Map a contract eviction-strategy id onto qdk's enum.

    Raises ValueError — not KeyError — for both failure modes, matching
    `build_isa_query`'s "Unknown secondary factory" convention, so the message
    that reaches the analyst names the value instead of being a bare key.
    """
    member = EVICTION_STRATEGY_MEMBERS.get(name)
    if member is None:
        raise ValueError(
            f"Unknown eviction strategy: {name!r}. "
            f"Expected one of {', '.join(sorted(EVICTION_STRATEGY_MEMBERS))}."
        )
    strategy = getattr(EvictionStrategy, member, None)
    if strategy is None:
        raise ValueError(
            f"qdk's EvictionStrategy has no member {member!r} "
            f"(contract id {name!r}); the installed qdk may be incompatible."
        )
    return strategy


def build_trace_query(trace_transform: dict[str, Any]):
    """Compose the ordered trace pipeline.

    PSSPC lowers arbitrary rotations and CCX into Pauli-based operations, and
    Lattice Surgery maps those onto lattice-surgery instructions. Both always
    run, and only in this order: `PSSPC.q()` alone yields an empty frontier, and
    `LatticeSurgery.q() * PSSPC.q()` raises "unsupported instruction
    LATTICE_SURGERY in trace transformation 'PSSPC'".

    v1.4.0 adds two OPTIONAL stages around them, for the full pipeline:

        DynamicMemoryCompute x PSSPC x LatticeSurgery x Unmemory

    Two rules this function exists to hold:

    1. Order is a correctness property, not a presentation choice — so the
       stages are assembled from a FIXED sequence and folded left to right,
       never from iterating a set or a dict's keys.
    2. An absent stage is absent from the composition. It is NOT run at its
       defaults. Those are different pipelines and therefore different
       estimates, and quietly substituting one for the other would add a stage
       the analyst never selected to every run.
    """
    stages = []

    dynamic_memory_compute = trace_transform.get("dynamicMemoryCompute")
    if dynamic_memory_compute is not None:
        stages.append(
            DynamicMemoryCompute.q(
                compute_capacity_percentage=dynamic_memory_compute[
                    "computeCapacityPercentage"
                ],
                eviction_strategy=resolve_eviction_strategy(
                    dynamic_memory_compute["evictionStrategy"]
                ),
            )
        )

    stages.append(
        PSSPC.q(
            num_ts_per_rotation=trace_transform["tStatesPerRotation"],
            ccx_magic_states=trace_transform["ccxMagicStates"],
        )
    )
    stages.append(LatticeSurgery.q(slow_down_factor=trace_transform["slowDownFactor"]))

    if trace_transform.get("unmemory"):
        stages.append(Unmemory.q())

    query = stages[0]
    for stage in stages[1:]:
        query = query * stage
    return query
 
 
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
        if type(node.transform).__name__ in ("SurfaceCode", "ThreeAux", "SurfaceCodeLowMove"):
            value = node.instruction.get_property_or(key, MISSING_PROPERTY)
            if value != MISSING_PROPERTY:
                return value
    return default
 
 
# Factory model class name -> the contract's MagicStateFactoryId.
FACTORY_MODEL_IDS = {
    "RoundBasedFactory": "round_based",
    "Litinski19Factory": "litinski19",
    "GSJ24Factory": "gsj24",
}


def find_magic_state_factory(entry: Any) -> str | None:
    """Which primary factory produced this frontier point.

    With a multi-select set the estimator unions the factories, so different
    rows of the SAME frontier can come from different factories. The winning
    one is named by its transform in the entry's source graph; reading it back
    is what keeps a multi-factory frontier legible instead of anonymous.
    """
    for node in entry.source.nodes:
        factory_id = FACTORY_MODEL_IDS.get(type(node.transform).__name__)
        if factory_id is not None:
            return factory_id
    return None


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
        "magicStateFactory": find_magic_state_factory(entry),
        "properties": {
            PROPERTY_NAMES.get(key, str(key)): jsonable(value)
            for key, value in entry.properties.items()
        },
    }
 
 
def qre_version() -> str:
    return importlib.metadata.version("qdk")
 
 
# The suggested next step appended to every failure message, keyed by code.
# INVALID_CONFIG gets its own: the diagnostic already names the field and its
# range, so pointing at raw qdk diagnostics would send the analyst away from the
# one thing they can actually fix.
#
# Read with .get(), never []: this is dereferenced INSIDE main()'s last-resort
# except block, where a KeyError would escape the handler and take the process
# down — turning a soft, explained failure into an ENGINE_CRASH traceback.
DEFAULT_NEXT_STEP = "Review the raw diagnostics, adjust the configuration, and retry."
NEXT_STEP = {
    "COMPILE_ERROR": "Check the program source and entry point, then retry.",
    "INVALID_CONFIG": "Correct the named field and retry.",
    "ESTIMATION_FAILED": DEFAULT_NEXT_STEP,
}


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
        isa_query = build_isa_query(
            invocation["qecCode"],
            invocation["magicStateFactories"],
            invocation.get("secondaryFactories"),
        )
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
        detail = diagnostic or exc_type
        message = f"{detail} {NEXT_STEP.get(error_code, DEFAULT_NEXT_STEP)}"
        print(json.dumps(failure(
            error_code,
            message,
            {"error": {"type": exc_type, "message": diagnostic}},
        )))
        return 0
 
 
if __name__ == "__main__":
    sys.exit(main())