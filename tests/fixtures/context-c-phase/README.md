# C phase Context Pack regression fixture

These are the six original Chinese `code_context` inputs from the 2026-11-04
C3 preparation calls: three related tasks, each repeated twice. They are not
six independent tasks or successful model runs.

`cases.json` preserves each input, original output SHA-256 and trial ID, plus
the required implementation declarations and known irrelevant helper files.
The historical input root is provenance; normal tests substitute a fresh root.

`sources.json` freezes nine complete, unchanged real source/test files from
`84412472b80c4d9a4edb00243e687df7731219bf` (the Gitignore fix's parent).
The `fixed` entries are only `src/scan.ts` and `src/repo-context.ts` from
`e4c5808121c33740a56c35e131bc12372221538b`. T1/T2 use the clean parent;
T3 commits that parent and applies those two files as real working-tree changes.
The same four real `repo` helpers and the actual scanner/index/tool source path
remain. The fixtures are parsed/indexed as source, not executed as application
code. Tests do not need Git history, the old scratch directories, a host or model.

The reduced fixture excludes unrelated production modules, including the
historically partial TSX client. Its character counts are therefore different
from the old complete-trial outputs. Complete-trial replay is supplementary:

```powershell
$env:CONTEXT_QUALITY_TRIALS_DIR = 'D:/path/to/original/trials'
$env:CONTEXT_QUALITY_REPORT = 'D:/path/to/output.json'
node node_modules/vitest/vitest.mjs run tests/context-c-phase.spec.ts
```

That mode reads each `T*-C3-r*` tree without writing or deleting it. Normal mode
uses two tiny isolated temporary Git repositories and cleans up only those.
`CONTEXT_QUALITY_REPORT` records inputs, expected/actual recall, known noise,
selected source ranges, reasons, provenance, text/JSON budgets and gaps.

Assertions require task-relevant implementation expressions, not just matching
names, filenames or signatures. Source must match the exact selected file lines.
The text and JSON budget checks both use the original 8000-character request.
Candidate tests must say they are candidates and not verified coverage.
