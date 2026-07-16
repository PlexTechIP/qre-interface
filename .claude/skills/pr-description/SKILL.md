---
name: pr-description
description: Draft a reviewer-ready pull request description in the team's standard template (Purpose / How to Try / Reviewer Focus / Testing). Use whenever preparing or opening a PR, or when the user asks to "write the PR", "open a PR", or "PR description".
---

# PR Description

Produce a pull request description in the team's standard template so every PR
gives reviewers the same consistent, actionable context. Ground everything in
the real diff — never invent changes, verification steps, or test claims.

## Steps

1. **Determine base and head.**
   - Head = current branch (`git rev-parse --abbrev-ref HEAD`).
   - Base = the branch this PR targets. Default per `docs/engineering-workflow.md`:
     a feature branch `week-N/team-X/...` targets its team branch `week-N/team-X`;
     a team branch targets `main`. If it's ambiguous, ask the user.
   - `$ARGUMENTS` may override the base and/or supply a title.

2. **Gather the actual change — do not guess.**
   - `git log --oneline <base>..HEAD` — the commits.
   - `git diff --stat <base>..HEAD` — files touched (ignore lockfiles/generated).
   - Read enough of `git diff <base>..HEAD` to describe *what* changed and *why*.
   - Identify tests added/changed and whether CI exercises them
     (`.github/workflows/`).

3. **Fill EVERY section of the template.** Keep it tight — reviewers skim.
   Prefer concrete file/function references and runnable commands over prose.
   Per `engineering-workflow.md`, the description must convey *what changed, how
   to verify it, and which checklist/DoD item it advances* — the template covers
   all three (the checklist item goes in **Purpose**).

4. **Output.**
   - Print the finished markdown in one copyable block.
   - If `gh` is available (`gh --version` succeeds), offer to open the PR:
     `gh pr create --base <base> --head <head> --title "<title>" --body-file <tmp>`.
     Otherwise, tell the user to paste it into the GitHub "New pull request" UI.
   - Do not push or open the PR without the user's go-ahead.

## Template

```markdown
## Purpose
<1–3 sentences: the problem/need, then what this PR does. If there are distinct
changes, use a numbered list. State which checklist item or Definition-of-Done
line this advances.>

## How to Try
<Behavioral steps a reviewer runs to see it work — real commands and expected
results. Include the failure / edge path when the change has one.>

## Reviewer Focus
<Where to look and why: key decisions, consistency with existing patterns (name
the files/helpers), anything subtle or risky, and cross-references to related
work or stacked PRs.>

## Testing
<Tests added/changed (name them) and what they assert; note whether they run in
CI.>

🤖 Generated with Claude Code
```

## Rules
- **One template, every PR.** Don't drop sections. If a section is genuinely
  N/A, say so in one line rather than deleting it.
- **Everything traces to the diff.** If you can't verify a "How to Try" step or a
  test claim from the actual changes, don't write it.
- Reference code as repo-relative paths; match the repo's tone.
