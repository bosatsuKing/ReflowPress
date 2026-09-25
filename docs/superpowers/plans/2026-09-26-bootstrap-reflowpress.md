# ReflowPress Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Establish a strict TypeScript monorepo foundation, type-level publication pipeline, test strategy, CI, and project documentation without implementing EPUB conversion.

**Architecture:** Keep stable pipeline contracts in `@reflowpress/core`; let EPUB, renderer, PDF, and validation packages own their format-specific types. Build each workspace package with project references and use Vitest for contract smoke tests.

**Tech Stack:** Node.js >=22.13, pnpm 11, TypeScript 6, Vitest 5, Playwright Test, ESLint 10, Prettier 3, GitHub Actions.

**Spec:** User-provided ReflowPress initial setup request.

## Global Constraints

- Keep Core independent of UI and conversion implementations.
- EPUB parsing and PDF generation remain unimplemented in this phase.
- TypeScript strict mode is enabled; target supported Node.js 22+.
- Do not introduce network calls or telemetry in application code.
- Preserve Node.js 22.13 compatibility required by the selected lint and test tooling.

## Review Focus

- A format adapter must produce a format-neutral publication model.
- Renderer output must be identifiable as PDF bytes and remain replaceable.
- DRM-protected input must be explicitly out of scope; no decryption behavior is introduced.
- Playwright setup must not require a dummy application or make GUI tests mandatory in CI.
- Build ordering must work from a clean checkout before unit tests run.

---

### Task 1: Workspace contracts and smoke tests

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `tsconfig.base.json`
- Create: `packages/{core,epub,renderer,pdf,validation}/package.json`
- Create: each package `src/index.ts` and `tsconfig.json`
- Create: `tests/unit/contracts.test.ts`, `vitest.config.ts`

**Interfaces:**

- Core exports `NormalizedPublication`, `PublicationSource`, `PublicationAdapter`, `PdfDocument`, `Renderer`, and render options.
- EPUB exports `EpubSource` and the `EpubPublicationAdapter` type contract.
- Renderer exports the `VivliostyleRenderer` type contract.
- Validation exports `PdfValidator` and `PdfValidationResult`.

- [ ] Add contract tests for normalized publication values and structural adapter/renderer implementations.
- [ ] Run `pnpm test`; confirm tests fail because contract modules do not yet exist.
- [ ] Implement the minimal type-only contracts and workspace package builds.
- [ ] Run `pnpm test` and `pnpm typecheck`; confirm they pass.
- [ ] Commit as `feat: define publication pipeline contracts`.

### Task 2: Project documentation and developer tooling

**Files:**

- Create: `README.md`, `LICENSE`, `.gitignore`, `.prettierignore`, `eslint.config.js`
- Create: `docs/product-requirements.md`, `docs/architecture.md`, `docs/test-strategy.md`, `docs/adr/0001-layered-publication-pipeline.md`
- Create: `apps/cli/README.md`, `tests/integration/README.md`, `tests/e2e/README.md`, `tests/fixtures/.gitkeep`
- Create: `playwright.config.ts`
- Modify: root `package.json` scripts and development dependencies

- [ ] Add Playwright configuration with `tests/e2e` as its target and no dummy app or browser install requirement.
- [ ] Document supported scope, architecture, roadmap, and all requested test design techniques and EPUB classes.
- [ ] Configure lint, formatting, typecheck, unit test, build, and optional e2e scripts.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Commit as `docs: document ReflowPress foundation and QA strategy`.

### Task 3: Continuous integration and final verification

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `README.md` if command documentation needs adjustment.

- [ ] Add pull request and `main` push workflow steps in the requested order: install, lint, typecheck, unit test, build.
- [ ] Keep Playwright E2E out of required CI until a GUI exists.
- [ ] Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` locally.
- [ ] Review the complete diff and commit as `ci: verify workspace on pull requests`.
