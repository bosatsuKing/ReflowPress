# Architecture

## Planned publication pipeline

The graph describes the intended conversion boundary. Existing TypeScript
contracts are labeled separately from implementations that are still
planned.

```mermaid
flowchart TD
    INPUT[Source publication]
    EPUB[EpubPublicationAdapter<br/>contract only]
    FUTURE[Future adapters<br/>CBZ / FB2 / HTML / Markdown]
    NORMALIZED[NormalizedPublication<br/>type implemented]
    RENDERER[Renderer<br/>contract implemented]
    VIV[Future: VivliostyleRenderer integration<br/>not implemented]
    PDF[PDF bytes<br/>output type implemented; generation planned]
    VALIDATOR[PdfValidator<br/>contract implemented; rules planned]
    RESULT[Validated PDF<br/>planned]

    INPUT --> EPUB
    INPUT -. future .-> FUTURE
    EPUB --> NORMALIZED
    FUTURE -. future .-> NORMALIZED
    NORMALIZED --> RENDERER
    RENDERER -. future implementation .-> VIV
    RENDERER --> PDF
    PDF --> VALIDATOR
    VALIDATOR --> RESULT
```

`packages/core` owns the format-neutral model and adapter/renderer contracts.
It has no UI dependency. `packages/epub` defines an EPUB source and adapter
contract, but does not inspect archives. `packages/renderer` defines renderer
contracts, including a type-level Vivliostyle contract, but does not launch
Vivliostyle. `packages/pdf` re-exports the shared PDF output type. `packages/validation`
defines the validator contract without inspecting PDF files.

## Package dependency graph

The graph below follows workspace `package.json` dependencies. Arrows point
from a package to a package it depends on.

```mermaid
flowchart TD
    CLI[apps/cli<br/>directory only; no package manifest]
    CORE[packages/core]
    EPUB[packages/epub]
    RENDERER[packages/renderer]
    PDF[packages/pdf]
    VALIDATION[packages/validation]

    EPUB --> CORE
    RENDERER --> CORE
    PDF --> CORE
    VALIDATION --> CORE
```

`pnpm-workspace.yaml` includes `apps/*` and `packages/*`. At this stage,
`apps/cli` contains documentation only, so it declares no package dependencies
and has no graph edges. The four package edges above are declared in their
respective manifests. There are no package dependency cycles. TypeScript
project references also point from each of those packages to `packages/core`.

The runtime dependency direction is therefore adapters and services toward
Core contracts. A future CLI can depend on these packages after it gains a
package manifest; it is not represented as an existing dependency today.

## Conversion pipeline

This is the planned conversion process; no stage currently reads or converts a
publication.

```mermaid
flowchart LR
    SOURCE[Electronic book or document]
    DETECT[Format detection<br/>planned]
    LOAD[Load<br/>planned]
    PARSE[Parse with format adapter<br/>planned]
    NORMALIZE[Normalize<br/>contract exists]
    RENDER[Render<br/>contract exists]
    PDF[PDF output<br/>type exists]
    VERIFY[Quality gate<br/>planned]
    OUTPUT[Output<br/>planned]

    SOURCE --> DETECT
    DETECT --> LOAD
    LOAD --> PARSE
    PARSE --> NORMALIZE
    NORMALIZE --> RENDER
    RENDER --> PDF
    PDF --> VERIFY
    VERIFY --> OUTPUT
```

Future EPUB, CBZ, FB2, HTML, Markdown, or other format adapters will handle
their source-specific loading and parsing before producing
`NormalizedPublication`. They are planned extension points, not supported
input implementations today.

## PDF quality loop

All checks in this loop are **Planned**. Generating a PDF alone will not count
as a successful conversion once the quality gate is implemented.

```mermaid
flowchart TD
    A[Render PDF<br/>planned]
    B[Openability check<br/>planned]
    C[Text layer check<br/>planned]
    D[Image check<br/>planned]
    E[Font check<br/>planned]
    F[Page geometry check<br/>planned]
    G[Content verification<br/>planned]
    H[Visual regression<br/>planned]
    PASS[PASS]
    FAIL[FAIL]

    A --> B
    B -->|OK| C
    C -->|OK| D
    D -->|OK| E
    E -->|OK| F
    F -->|OK| G
    G -->|OK| H
    H -->|OK| PASS

    B -->|NG| FAIL
    C -->|NG| FAIL
    D -->|NG| FAIL
    E -->|NG| FAIL
    F -->|NG| FAIL
    G -->|NG| FAIL
    H -->|NG| FAIL
    FAIL --> A
```

Visual regression is planned for after rendering is stable and reviewed page
baselines exist. Golden master comparisons will avoid raw PDF byte comparisons
when timestamps or object ordering are nondeterministic.

## Current boundaries

- Core contracts contain no file, network, renderer, or GUI implementation.
- The EPUB package describes EPUB input types only; DRM removal is out of
  scope.
- A renderer can be replaced by implementing `Renderer` without changing the
  normalized publication contract.
- The CLI and a future desktop GUI are application entry points and will use
  the same Core contracts.

See [ADR 0001](adr/0001-layered-publication-pipeline.md) for the initial
architecture decision and [the diagram index](diagrams/README.md) for the
complete graph list.
