# v2 Cleanup Key-Casing Audit

Date: 2026-05-24

Scope:
- `workflows/*/workflow.yml`
- workflow-facing agent contracts under `workflows/*/agents/**/AGENTS.md`
- runtime workflow parsing in `src/installer/workflow-spec.ts`
- CLI workflow validation in `src/cli/validate.ts`

Canonical casing:
- Workflow dependency/control keys: `depends_on`, `max_retries`, `on_fail`, `timeout_minutes`
- Runtime timeout/model keys already accepted by TypeScript interfaces: `timeoutSeconds`, `pollingModel`, `baseDir`
- Output contract keys: uppercase snake case in agent output, for example `PRD_VALIDATION`, `ARCH_VALIDATION`, `QA_VALIDATION`, `RELEASE_VALIDATION`, and `REVIEW_FINDINGS_VALIDATION`

Audit result:
- Legacy workflow-key variants are blocked by `tests/key-casing-audit.test.ts`.
- The audit rejects `dependsOn`, `maxRetries`, `onFail`, `timeout_seconds`, `timeoutMinutes`, `polling_model`, and `base_dir`.
- Loop config remains backwards-compatible in `workflow-spec.ts` for existing `fresh_session`/`freshSession`, `verify_each`/`verifyEach`, and `verify_step`/`verifyStep` because those variants are already parsed deliberately.

Acceptance:
- A clean `npm run build` plus `node --test dist/tests/key-casing-audit.test.js` is the evidence that workflow YAML casing has not regressed.
