# Product requirements

## Product

ReflowPress is a local tool for converting electronic publications and
documents into predictable PDFs for reading, review, and use with document
analysis tools. The project also demonstrates sound TypeScript architecture,
automated testing, and QA practice.

## Initial goal

Build the development foundation first. The first conversion path planned for
implementation is EPUB 3 reflowable or fixed-layout input to PDF. EPUB 2 is
included in inspection and compatibility planning. Conversion itself is not
part of the foundation phase.

## Users and needs

- A reader needs a portable PDF representation of a publication.
- A developer needs clear boundaries between source parsing, rendering, and
  validation.
- A maintainer needs repeatable tests and CI to catch regressions.

## Scope for Phase 0

- Node.js 22.13+, pnpm, strict TypeScript, Vitest, Playwright Test, ESLint,
  Prettier, and GitHub Actions.
- Shared contracts for normalized publication data, adapters, renderers, PDF
  output, and validation.
- Initial test strategy and architecture documentation.
- No conversion engine, GUI, remote service, telemetry, or DRM removal.

## Scope for Phase 0.5

- Stabilize the bootstrap and make the architecture, development loop, planned
  conversion pipeline, PDF quality gate, and test feedback loop visible in
  repository documentation. This phase is complete.
- Keep diagrams aligned with declared package dependencies and label future
  implementations as planned.

## Scope for Phase 1

- Inspect an EPUB ZIP container and its OPF package document without extracting
  publication content or converting it.
- Return the package path, available title/language/identifier/creator metadata,
  manifest entries, and spine order as package-specific structured data.
- Classify invalid archives, missing or malformed container/package documents,
  invalid package references, and missing manifest targets.
- Keep EPUB parsing and ZIP/XML details inside `packages/epub`; do not add
  EPUB-specific fields to Core contracts.
- Reject unsafe archive paths and package references that escape the archive.
  Do not resolve DTDs or external entities or make network requests.
- Apply configurable archive byte, entry count, and metadata document limits.
- No PDF generation, Vivliostyle integration, PDF quality gate, CLI workflow,
  or GUI implementation.

## PDF output naming requirement (planned for Phase 2)

The default PDF filename will preserve the source filename stem and append the
conversion time in `YYYYMMDD-HHmmss` form:

```text
book.epub                 -> book_20260926-064530.pdf
吾輩は猫である.epub       -> 吾輩は猫である_20260926-064530.pdf
```

Do not use default auto-numbering such as `output.pdf`, `output1.pdf`, and
`output2.pdf`. If the same source produces a filename collision within the same
second, an implementation may append `-001`, `-002`, and so on. The eventual
filename helper should accept the conversion time as an argument (for example,
`createOutputFileName(sourceName, convertedAt)`) so tests can control time.
This is a Phase 2 requirement only; Phase 1 does not implement filename logic.

## Quality attributes

- Correctness: unsupported and malformed inputs should eventually fail with
  useful, testable errors.
- Maintainability: packages have clear responsibilities and minimal coupling.
- Testability: boundaries can be checked independently and end to end.
- Regression safety: representative fixtures and output checks protect later
  conversion behavior.
- Privacy: processing is local by default; source contents and paths are not
  sent to remote services.
