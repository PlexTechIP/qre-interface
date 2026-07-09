# Statement of Work

## Microsoft
**Summer 2026**

info@plextech.studentorg.berkeley.edu

---

## Microsoft x PlexTech Software Consulting Statement of Work

### Project Overview

**About Microsoft:** Microsoft is a global technology company whose Quantum platform and Quantum Resource Estimator (QRE) provide tooling for quantum algorithm analysis, resource estimation, and hardware architecture evaluation. These tools enable researchers and practitioners to evaluate quantum workloads under different hardware assumptions and error correction models.

**Project Objectives:** The primary objective of this project is to design and develop a standalone desktop application that integrates Microsoft's Quantum Resource Estimator (QRE v3) as a locally bundled execution engine. The application will provide a simplified, structured interface for configuring quantum resource estimation workflows, executing estimates locally, comparing results across saved runs, and exporting outputs for reporting and downstream analysis. The system will support government and industry users who use QRE as a benchmarking and evaluation tool.

Users will be able to define estimation runs using an application model, architecture model, error correction and factory model, and error budget. Each run will also capture the QRE engine version used, allowing results to remain reproducible across future QRE updates.

Secondary objectives include iterative UI and UX validation with Microsoft stakeholders to ensure alignment between system design and end-user workflows, particularly around configuration simplicity, metric interpretation, and comparison of QRE outputs.

**Project Focus:** This initiative aligns with Microsoft's strategic goals to improve access to quantum resource estimation tools for non-research users while preserving the rigor and reproducibility required for technical evaluation. The project focuses on translating QRE's existing capabilities into a standalone, decision-oriented desktop experience for government and business stakeholders.

The application is intended for users who are interested in resource estimates, architecture comparisons, and benchmark-level analysis rather than quantum program development. The product will focus on resource estimation, comparison, traceability, and export workflows. Organizations may use these structured QRE outputs in their own downstream analysis, reporting, or cost-modeling processes.

---

### Project Scope

**Project Summary:** PlexTech will design and build a standalone desktop application for running Microsoft's Quantum Resource Estimator (QRE v3) outside of VS Code or command-line workflows. The basic unit of the application is a run: a locally executed resource estimation defined by an application model, architecture model, error correction and factory model, error budget, and QRE engine version. Each run is saved as an immutable record containing its configuration and output metrics, enabling users to revisit prior estimates, duplicate runs with modified parameters, compare results across configurations, and export outputs for reporting or downstream analysis.

#### Part 1: Core Estimation Workflow

1. Build a standalone desktop application for macOS and Windows that runs Microsoft's Quantum Resource Estimator (QRE v3) locally through a bundled execution engine.
2. Develop a unified dashboard where users configure and execute QRE estimation runs from a single interface.
3. Support QRE's core inputs: application model, architecture model, error correction and factory model, error budget, and QRE engine version.
4. Support benchmark selection and user-imported quantum programs where feasible.
5. Execute estimation runs locally and generate structured QRE outputs.
6. Display output metrics including runtime per shot, physical qubits, logical error rate, logical cycle time, T states required, and additional QRE-provided metrics.
7. Provide filtering controls for metric selection while preserving full output availability.

#### Part 2: Run History, Traceability, and Comparison

1. Store each executed estimation as a local immutable run record.
2. Capture full input configuration, QRE version, timestamp, and output metrics.
3. Each run serves as a primary unit for comparison across configurations.
4. Provide a run history interface for viewing, deleting, and duplicating runs.
5. Enable run duplication to re-execute estimations with modified parameters.
6. Build a comparison workspace for selecting multiple runs and comparing metrics.
7. Support comparison across different qubit architectures and modalities, error correction models, benchmarks, QRE versions, and error budgets.
8. Display comparisons using structured tables and metric-based visualizations.

#### Part 3: Export, Versioning, and Maintainability

1. Support exporting individual runs and comparison sets for reporting and analysis.
2. Prioritize Markdown file export formats to support a code-accessible format.
3. Include both summary-level and detailed metric views in exports.
4. Include metadata such as QRE version, configuration inputs, benchmark, and timestamp.
5. Ship the application with a bundled baseline QRE v3 engine.
6. Track QRE engine version for every run to ensure reproducibility.
7. Implement a pull-oriented update mechanism for the desktop application and benchmark library.
8. Support benchmark library updates from a controlled repository with local metadata storage.

#### Part 4: Final Outcomes

1. Deliver a packaged macOS and Windows desktop application.
2. Integrate QRE v3 as a locally executed computation engine.
3. Deliver a run-based system with immutable history and comparison workflows.
4. Provide structured export functionality for reporting and downstream analysis.
5. Deliver a final presentation summarizing system design, architecture, and implementation.
6. Provide documentation covering setup, workflows, versioning, and system behavior.
7. Provide recommendations for future improvements including benchmark expansion and visualization enhancements.

#### Part 5: Stretch Goals

1. UI and UX validation sessions with additional stakeholder feedback.
2. Advanced visualization improvements for deeper comparative analysis.

---

### Stakeholders and Decision-Makers

- **Jeffrey Lai** — Senior Director, FW/SW
- **Simon Wong** — Senior TPM, FW/SW
- **Hariharan Ragunathan** — Principal TPM, QRE
- **Justin Hogaboam** — Senior Principal Quantum System Architect

---

### Potential Timeline

PlexTech Software Consulting will execute this project within the time frame of Summer 2026. Accordingly, the project length will be approximately 8-12 weeks wherein each team member will contribute 10‐14 hours of individual work per week. PlexTech developers will present a midterm deliverable (after the completion of Part 1) and final deliverable (after the completion of Part 3), and a final report-out will be sent at the end of the engagement with PlexTech's finalized analysis & recommendations.

| Action | Owner | Completion Date (Proposed) |
|---|---|---|
| SOW Alignment + Approval | PlexTech + Microsoft | June 30, 2026 |
| Official Project Start | PlexTech | June 30, 2026 |
| Check-Ins | PlexTech + Microsoft | Weekly every Friday and as needed |
| Midterm Deliverable | PlexTech | July 24, 2026 |
| Final Deliverable + Report | PlexTech | August 28, 2026 |

---

### Reporting and Communication

- Weekly Zoom/Teams calls between PlexTech and Jeffrey Lai, Simon Wong, Hariharan Ragunathan, and Justin Hogaboam – PowerPoint and project timeline software can be used for these calls.
- Final deliverable and final report out at the end of the project. PlexTech will provide an electronic copy of materials at the conclusion of the project.

---

### Data and Information

- Provide access to pertinent data sources used for analysis.
- Microsoft will provide access to relevant QRE documentation, benchmark definitions, sample applications, and guidance on supported input formats required for system integration.
- Where available, feedback from relevant stakeholders or users will be incorporated to ensure alignment with expected workflows and output interpretation.

---

### Methodology

**Languages/Technologies:** The application will be implemented as a standalone desktop application using Electron with a React and TypeScript frontend. Microsoft's Quantum Resource Estimator (QRE v3) will be integrated as a locally bundled execution engine. Local persistence will be handled using SQLite to support run history, comparison workflows, and offline execution. Visualization components will be implemented using a charting library such as Recharts or Plotly. Final technology decisions may be adjusted based on integration requirements, packaging constraints, and stakeholder feedback. The system will prioritize reliability, cross-platform support for macOS and Windows, and consistent execution of QRE workloads in a local environment.

**Research Approach:** PlexTech should employ a combination of qualitative and quantitative research methodologies to gather comprehensive insights into user workflows, current pain points with the VS Code extension, and mental models for cross-architecture comparisons.

**Iterative Feedback Process:** Establish an iterative feedback process to ensure ongoing collaboration and alignment with Microsoft's expectations throughout the analysis.

**Regular Communication:** Provide regular updates and interim reports at agreed-upon milestones to keep Microsoft informed of progress and findings.

**Final Presentation and Documentation:** Present the final results in a clear and concise manner, including a detailed methodology section in the final report. Documentation should be provided covering application setup, QRE integration, run history and comparison behavior, export functionality, and versioning model. All relevant system components, including run configuration schema, benchmark handling, and output interpretation logic, will be documented to support future extension and maintenance of the application.