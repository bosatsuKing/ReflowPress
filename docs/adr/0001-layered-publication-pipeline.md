# ADR 0001: Layered publication pipeline

- Status: Accepted for the foundation phase
- Date: 2026-09-26

## Context

ReflowPress will start with EPUB to PDF and may later accept other publication
formats or use another renderer. CLI and desktop interfaces should share the
same conversion Core. EPUB parsing, document layout, and PDF validation have
different responsibilities and should remain independently testable.

## Decision

Use a pipeline of source adapter, normalized publication, renderer, PDF
output, and validator. Keep the format-neutral contracts in `@reflowpress/core`
and define format- or engine-specific contracts in their corresponding
packages. UI applications depend on Core rather than owning conversion logic.

## Consequences

- New source formats can map into the shared normalized model.
- A renderer can be replaced behind the shared renderer contract.
- Each boundary can be tested independently.
- The normalized model may need revision once EPUB inspection and rendering
  requirements are concrete.
- This decision adds package boundaries before conversion code exists, so the
  implementation should keep the contracts small.
