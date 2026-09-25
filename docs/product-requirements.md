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
  repository documentation.
- Keep diagrams aligned with declared package dependencies and label future
  implementations as planned.
- Resolve the local verification and Git access issues in an environment with
  command-level write access before beginning EPUB Inspector work.

## Quality attributes

- Correctness: unsupported and malformed inputs should eventually fail with
  useful, testable errors.
- Maintainability: packages have clear responsibilities and minimal coupling.
- Testability: boundaries can be checked independently and end to end.
- Regression safety: representative fixtures and output checks protect later
  conversion behavior.
- Privacy: processing is local by default; source contents and paths are not
  sent to remote services.
