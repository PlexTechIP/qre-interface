---
name: pr-description
description: Draft a reviewer-ready pull request description in the team's standard template (Purpose / How to Try / Reviewer Focus / Testing). Use whenever preparing or opening a PR, or when the user asks to "write the PR", "open a PR", or "PR description".
---

# PR Description

Produce a pull request description in the team's standard template so every PR
gives reviewers the same consistent, actionable context. Ground everything in
the real diff — never invent changes, verification steps, or test claims.

**Write it so a busy reviewer with _no context on this project_ can follow it —
including non-engineer stakeholders and PMs.** Plain language, decisions first,
everyday words over jargon. Keep precise technical terms available (via pointers)
for engineer reviewers, but never require them to follow the main thread. See the
plain-language rules at the bottom.

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
<Open with a one-line, plain-English "what this is" that assumes zero project
context. Then 1–3 plain sentences of background (what the change is for) and what
this PR does; use a numbered list for distinct changes. State which checklist or
Definition-of-Done item it advances.>

## ⚠️ <Decision needed> — include this section ONLY when a reviewer must rule on something
<When the PR needs a call from the reviewer (a contract/API change, a risky
trade-off, a deviation from spec), surface it here — near the top, in everyday
terms: what you did, why, the evidence in one line, and the clear options
(approve / the alternative). Name anyone else affected. Omit this section
entirely when there's no decision to make.>

## How to Try
<Behavioral steps a reviewer runs to see it work — real commands and expected
results, described plainly (say what they'll see, not just what to run). Include
the failure / edge path when the change has one, and point to any evidence they
can read without running anything.>

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
  N/A, say so in one line rather than deleting it. (The "Decision needed" callout
  is the exception — include it only when there's a decision.)
- **Everything traces to the diff.** If you can't verify a "How to Try" step or a
  test claim from the actual changes, don't write it.
- Reference code as repo-relative paths; match the repo's tone.

## Plain-language rules (write for a reader with no context)
- **Assume the reviewer may be a busy PM/stakeholder who doesn't know this
  project.** Open with a one-line "what this is." Explain *why it matters*, not
  just *what changed*. Short sentences, everyday words.
- **Avoid unexplained jargon and acronyms in the main thread.** When a precise
  term is unavoidable, gloss it in plain words on first use, or point to a doc
  for the detail — don't make following the PR depend on knowing it.
- **Decisions go first, in plain terms.** If the reviewer must approve or choose
  something, put it in the "Decision needed" callout up top with plain-language
  options — never bury a contract/API change or risky trade-off inside jargon.
- **Keep technical precision available, not mandatory.** Exact names, files, and
  terms belong in the PR (engineers need them), but reachable via pointers so a
  non-expert can still follow the main story.
- Translate domain terms to their effect: e.g. "accepted but has no effect yet,"
  "the two options are modeled together rather than either/or" — say what it
  *means* for the reader, then link the precise wording.
