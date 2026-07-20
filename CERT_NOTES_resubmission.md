# Codex Bullet Chart — Cert Notes (resubmission wave, Phase 01)

**Version:** 1.0.0.14 (visual.version) · production GUID unchanged (`codexBulletChart…`) · API 5.11.0 / pbiviz 7.0.2 (pinned).

One-wave AppSource resubmission carrying the transparency/formatting rework **and** the v2 appearance redesign. Partner Center re-evaluates the whole package (Pitfall 6).

## Transparency wave (Plan 08)
- New **Background** card: `ColorPicker` fill + 0–100 `transparency` slider via `hexToRGBString`. Additive.
- **`transparent` → `transparency` migration:** Bullet Chart's legacy `transparent` property was migrated to the suite-standard `transparency` (0–100) model. Saved reports keep resolving.
- fx conditional formatting wired on eligible colour properties.

## Title + per-region text wave (Plans 13–14)
- Title + per-region text treatment reworked with adaptive text colour.

## v2 Appearance wave (Plan 17)
- Band-engine measure bar (beveled gradient + dark glow); unified violet target tick; qualitative ranges rendered as dim steps.
- **New optional Quantised (LED) measure mode:** +2 additive `capabilities.json` properties (toggle default OFF; block count default 20, clamped 4–60); works in both orientations — an equally-valid option, not a forced default.
- `getBarColor()` folded into `resolveMeasure()` (same ColorHelper fx resolution, now first rung of the D-16 ladder).
- **D-16:** saved colour/fx overrides still resolve.

## High-contrast rule
Shared HC rule wired (`src/shared/highContrast.ts`).

## Branch reconciliation
`certification` was fast-forwarded into `main` (Plan 01-17 Task 1) — confirmed: `main..certification` is empty, so no fix is stranded off `main`. Packaged from `main`.

## Pending fixes riding this wave
No independent functional fix beyond the transparency migration + v2 look above (PENDING-FIXES: branch-risk only, now reconciled).
