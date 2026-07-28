# qdk 1.30.0 Validation Notes

Date: 2026-07-27 PDT
Platform: macOS 15.6.1 arm64
Python used for validation: `~/.local/python-3.13.14/bin/python3`
Project venv: `app/src/main/engine/python/.venv`

## Environment

- Python installed locally under the user account because the official macOS
  package requires admin privileges.
- Venv rebuilt with `qdk[qre]==1.30.0` from
  `app/src/main/engine/python/requirements.txt`.
- Verified venv reports Python `3.13.14`.
- Verified installed QDK package reports `1.30.0`.

## Regression Results

- `npm run typecheck`: passed.
- `npm test`: passed, 22 files / 178 tests.
- `npm run test:engine`: passed, 11 files / 33 tests.

QDK 1.30.0 changed `Instruction.get_property_or` behavior: passing `None` as
the default now fails. The wrapper now uses an unsigned sentinel and converts
missing properties back to omission in JSON.

## Team 1 Dependency Checks

- `NeutralAtom`: present.
- `SurfaceCodeLowMove`: present.
- `GSJ24Factory`: present.
- `GSJ24CCXFactory`: present.
- `MagicUpToClifford`: present.
- Yoked code exports are present as `OneDimensionalYokedSurfaceCode` and
  `TwoDimensionalYokedSurfaceCode`.
- `QSharpApplication` signature accepts `entry_expr: str | Callable |
  LogicalCounts`.
- `NeutralAtom` defaults in QDK 1.30.0:
  `rydberg_time=500`, `rydberg_error=0.001`, `one_qubit_time=1000`,
  `one_qubit_error=0.0001`, `measurement_time=10000`,
  `measurement_error=0.0001`, `handoff_time=0`, `atom_spacing=3.0`,
  `data_qubit_spacing=12.0`, `max_velocity=0.25`,
  `max_acceleration=5000.0`,
  `surface_code_two_qubit_time_factor=1`,
  `surface_code_one_qubit_time_factor=1`, `target_year=None`.

The Neutral Atom defaults still need to be compared against the pinned Features
and Fields Google Doc.

## Deferred Contract Question Checks

- Sparse `tStatesPerRotation: 5` still returns no feasible Pareto frontier on
  QDK 1.30.0.
- `Majorana` now exposes additional parameters:
  `time=1000`, `t_error_rate=None`, `target_year=None`.
  The wrapper still builds `Majorana(error_rate=...)`; mapping
  `operationTime` to `time` should be PM-reviewed because it changes behavior.
- The previously missing appendix property names now exist in
  `qdk.qre.property_keys`: `BLOCK_SIZE`, `BASE_SYSTEM_COST`, `SHOT_COST`,
  `COST_PER_QUBIT`, `COST_PER_HOUR`, `COST_PER_QUBIT_PER_HOUR`, and
  `DATA_QUBIT_SPACING`.
- The `source` field remains provisional; no new flat ISA/source mapping was
  verified in this pass.

## Still Needs Human Validation

- Compare Neutral Atom defaults against the Features and Fields Google Doc.
- Execute the setup guide from a genuinely clean clone or fresh user account.
- Have a Team 1 or Team 2 reader validate the architecture guide and record who
  tested it.
- Validate Windows setup steps on a Windows machine.
