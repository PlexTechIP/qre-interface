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
import math
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
 
 
# ---------------------------------------------------------------------------
# Architecture parameter bounds
# ---------------------------------------------------------------------------
#
# qdk validates NO architecture parameter. `GateBased`, `Majorana` and
# `NeutralAtom` are plain dataclasses whose only `__post_init__` logic is
# Majorana's `t_error_rate` derivation, so every field below constructs happily
# from a negative, zero, or absurd value. Measured on 1.30.0, that lands three
# ways:
#
#   * a WRONG NUMBER reported as success -- `gateBased error_rate=-1e-4`
#     estimates and returns `error: -9.99e-05`, a negative probability, on the
#     DEFAULT architecture;
#   * a soft failure blaming the wrong thing -- "math domain error" for
#     `atom_spacing=-3`, reported as ESTIMATION_FAILED;
#   * a hard crash -- `majorana time=0` panics inside pyo3, and PanicException
#     derives from BaseException, so `main()`'s `except Exception` never sees it
#     and the run comes back ENGINE_CRASH ("verify the Python environment").
#
# The rules below are transcribed from runconfig.schema.json's three
# architecture variants and use the schema's own vocabulary, so the two can be
# diffed by eye. `configToInvocation` checks the same bounds first; these are
# the second line of defence, for a config that reaches the engine another way.
#
# ONE DELIBERATE DIVERGENCE from the schema: the four time fields marked
# `integer` below are typed `number` there, but qdk requires a Python int and
# rejects 50.5 with "'float' object cannot be interpreted as an integer".
# Enforcing it here turns that into a named field error. See
# risks-and-open-questions.md -- the schema is what should move.

GATE_BASED_RULES: dict[str, dict[str, Any]] = {
    "errorRate": {"exclusive_minimum": 0, "exclusive_maximum": 0.01},
    "gateTime": {"exclusive_minimum": 0, "integer": True},
    "measurementTime": {"exclusive_minimum": 0, "integer": True},
    "twoQubitGateTime": {"exclusive_minimum": 0, "integer": True, "optional": True},
}

# `errorRate` is an enum rather than a range, and EXACT rather than qdk's own
# tolerance test (`abs(x - 1e-4) <= 1e-8`), matching the schema. qdk's check is
# unusable anyway: it sits inside `__post_init__`'s `if t_error_rate is None:`
# branch, so supplying a `t_error_rate` skips it entirely.
#
# `tErrorRate`'s (0, 0.05] is not an arbitrary cap: 0.05 is the LARGEST value
# qdk's own derivation ever produces (error_rate 1e-4 -> 0.05, 1e-5 -> 0.015,
# 1e-6 -> 0.01), so the bound is the edge of the regime qdk models.
MAJORANA_RULES: dict[str, dict[str, Any]] = {
    "errorRate": {"enum": (1e-4, 1e-5, 1e-6)},
    "operationTime": {"exclusive_minimum": 0, "integer": True},
    "tErrorRate": {"exclusive_minimum": 0, "maximum": 0.05, "optional": True},
    "targetYear": {"minimum": 0, "integer": True, "optional": True},
}

NEUTRAL_ATOM_RULES: dict[str, dict[str, Any]] = {
    "rydbergTime": {"exclusive_minimum": 0, "integer": True},
    "rydbergError": {"minimum": 0, "exclusive_maximum": 0.01},
    "singleQubitTime": {"exclusive_minimum": 0, "integer": True},
    "singleQubitError": {"minimum": 0, "exclusive_maximum": 0.01},
    "measurementTime": {"exclusive_minimum": 0, "integer": True},
    "measurementError": {"minimum": 0, "exclusive_maximum": 0.01},
    "handoffTime": {"minimum": 0, "integer": True},
    "atomSpacing": {"exclusive_minimum": 0},
    "dataQubitSpacing": {"exclusive_minimum": 0, "optional": True},
    "maxVelocity": {"exclusive_minimum": 0},
    "maxAcceleration": {"exclusive_minimum": 0},
    "surfaceCodeOneQubitTimeFactor": {"minimum": 1, "integer": True},
    "surfaceCodeTwoQubitTimeFactor": {"minimum": 1, "integer": True},
    "targetYear": {"minimum": 0, "integer": True, "optional": True},
}


def _constraint_text(rule: dict[str, Any]) -> str:
    """Describe a rule the way configToInvocation's messages describe it."""
    if "enum" in rule:
        return "one of " + ", ".join(f"{value:.0e}" for value in rule["enum"])

    prefix = "an integer " if rule.get("integer") else ""
    low = (
        ("[", ">=", rule["minimum"])
        if "minimum" in rule
        else ("(", ">", rule["exclusive_minimum"])
        if "exclusive_minimum" in rule
        else None
    )
    high = (
        ("]", "<=", rule["maximum"])
        if "maximum" in rule
        else (")", "<", rule["exclusive_maximum"])
        if "exclusive_maximum" in rule
        else None
    )
    if low and high:
        return f"{prefix}in {low[0]}{low[2]}, {high[2]}{high[0]}"
    if low:
        return f"{prefix}{low[1]} {low[2]}"
    if high:
        return f"{prefix}{high[1]} {high[2]}"
    return f"{prefix}a number"


def checked_number(value: Any, label: str, rule: dict[str, Any]):
    """Check one architecture parameter against its rule, or refuse the run.

    An absent OPTIONAL field stays absent: for every optional parameter here
    that means "let qdk derive or default it", and substituting a value would
    run a configuration the saved record does not describe. An absent REQUIRED
    field falls through to the same refusal as a bad one, so it is named rather
    than raising a bare KeyError three frames down.

    An `integer` rule is a check on the VALUE, not the JSON type, and the result
    is coerced with `int()`. JavaScript cannot tell 1000 from 1000.0, so a
    producer emitting the latter is describing the same configuration -- but
    qdk rejects the float outright, so coercing is what keeps the boundary
    forgiving about representation while strict about value.
    """
    if value is None and rule.get("optional"):
        return None

    # `bool` is a subclass of `int` in Python, so it has to be excluded before
    # the numeric tests rather than left to them. Short-circuiting keeps
    # `float()` away from strings, None, lists and dicts.
    numeric = not isinstance(value, bool) and isinstance(value, (int, float))
    number = float(value) if numeric else None

    if number is None or not math.isfinite(number):
        # isfinite() IS load-bearing here, unlike in a fully-bounded range:
        # json.loads accepts the non-standard `Infinity` literal, and a field
        # with no upper bound (atomSpacing, maxVelocity) would otherwise pass it
        # straight through to qdk.
        ok = False
    elif "enum" in rule:
        ok = number in rule["enum"]
    else:
        ok = (
            (not rule.get("integer") or number.is_integer())
            and ("minimum" not in rule or number >= rule["minimum"])
            and ("exclusive_minimum" not in rule or number > rule["exclusive_minimum"])
            and ("maximum" not in rule or number <= rule["maximum"])
            and ("exclusive_maximum" not in rule or number < rule["exclusive_maximum"])
        )

    if not ok:
        raise InvalidInvocation(
            f"{label} must be {_constraint_text(rule)}, got {value!r}."
        )
    return int(number) if rule.get("integer") else number


def checked_fields(
    architecture: dict[str, Any], label: str, rules: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Validate every declared parameter of an architecture, returning the values."""
    return {
        name: checked_number(architecture.get(name), f"{label} {name}", rule)
        for name, rule in rules.items()
    }


def build_architecture(architecture: dict[str, Any]):
    arch_type = architecture["type"]
    if arch_type == "gateBased":
        checked = checked_fields(architecture, "GateBased", GATE_BASED_RULES)
        return GateBased(
            error_rate=checked["errorRate"],
            gate_time=checked["gateTime"],
            measurement_time=checked["measurementTime"],
            # Optional: None here means "let qdk derive it from gate_time",
            # which is what every config without a two-qubit time has always
            # done. It is NOT a value being substituted.
            two_qubit_gate_time=checked["twoQubitGateTime"],
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
        # Every parameter is re-checked HERE as well as in configToInvocation,
        # because qdk checks none of them usefully — see MAJORANA_RULES.
        checked = checked_fields(architecture, "Majorana", MAJORANA_RULES)
        return Majorana(
            error_rate=checked["errorRate"],
            time=checked["operationTime"],
            t_error_rate=checked["tErrorRate"],
            target_year=checked["targetYear"],
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
        checked = checked_fields(architecture, "NeutralAtom", NEUTRAL_ATOM_RULES)
        optional: dict[str, Any] = {}
        if checked["dataQubitSpacing"] is not None:
            optional["data_qubit_spacing"] = checked["dataQubitSpacing"]

        return NeutralAtom(
            rydberg_time=checked["rydbergTime"],
            rydberg_error=checked["rydbergError"],
            one_qubit_time=checked["singleQubitTime"],
            one_qubit_error=checked["singleQubitError"],
            measurement_time=checked["measurementTime"],
            measurement_error=checked["measurementError"],
            handoff_time=checked["handoffTime"],
            atom_spacing=checked["atomSpacing"],
            max_velocity=checked["maxVelocity"],
            max_acceleration=checked["maxAcceleration"],
            surface_code_one_qubit_time_factor=checked["surfaceCodeOneQubitTimeFactor"],
            surface_code_two_qubit_time_factor=checked["surfaceCodeTwoQubitTimeFactor"],
            target_year=checked["targetYear"],
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