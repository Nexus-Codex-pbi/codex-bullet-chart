# Codex Bullet Chart — Cert Notes (licensing resubmission wave)

**Version:** 1.0.0.19 (visual.version) · production GUID unchanged (`codexBulletChart…`) · API 5.11.0 / pbiviz 7.0.2 (pinned).

**Review scope — everything since 15 Jun 2026 is unreviewed.** Verified against the offer's
Partner Center History page:

| Date | Event |
|---|---|
| 15 Jun 2026 | last package to pass certification and publish |
| 1 Aug 2026 | submitted → **Publishing not completed** (sample `.pbix` did not embed the matching build — fixed, see below) |
| 4 Aug 2026 | submitted → cancelled before review |
| 5 Aug 2026 | submitted → cancelled before review |

So this submission carries **every change from 11 Jul onward**, not just the licensing work.

## Licensing (the change this wave adds)

- `licenseManager.getAvailableServicePlans()` is called once on construction.
- With no Active/Warning plan, `notifyLicenseRequired(LicenseNotificationType.General)` is raised.
  `General`, **not** `VisualIsBlocked` — Microsoft enforces `General` only in Edit scenarios, so a
  report viewer is never interrupted and the visual keeps rendering. Verified in the built bundle:
  the compiled call is `notifyLicenseRequired(0)`; `VisualIsBlocked` does not appear.
- **Fails open** on `isLicenseInfoAvailable === false`, `isLicenseUnsupportedEnv === true` (Publish
  to Web, PaaS embed, national clouds, Report Server, PDF/PPT export), or an absent API.
- **No network calls added.** Verified in the built bundle: no `fetch`, `XMLHttpRequest`, `WebSocket`.
- `src/shared/suiteKey.ts` is in the repo but imported by nothing — webpack tree-shakes it out. The
  bundle contains no `crypto.subtle`, no `NCX1`, no `ECDSA`.

## Certification-relevant fixes riding this wave

- **1180.2.2 cross-filtering** (`0520455`): `"supportsHighlight": true` was declared but the visual
  never read the highlights array, which suppressed filtering. Removed; the host now filters
  `values[]` per the documented default.
- **Sample/package mismatch** (cause of the 1 Aug failure): the sample `.pbix` is now re-embedded to
  this exact build and verified byte-level before upload, by script, not by hand.
- eslint 9 → 10 for the `npm audit` gate (`686d2c9`). devDependencies only — shipped bundle unchanged.

## Feature waves riding this submission (all post-15-Jun)

- **Transparency:** `Background` card — `ColorPicker` fill + 0–100 `transparency` slider via
  `hexToRGBString`. Legacy `transparent` boolean migrated to the suite-standard `transparency`
  model; saved reports keep resolving. fx wired on eligible colour properties.
- **v2 appearance:** band-engine measure bar (bevelled gradient + glow), unified target tick,
  qualitative ranges as dim steps. **Quantised (LED) measure mode** — +2 additive properties
  (toggle default OFF, block count default 20, clamped 4–60), works in both orientations.
- **Fixes:** value label nudges past the target marker on collision (both orientations);
  category axis label reinstated + surface-aware value text; border colour fx now persists
  (dropped a wildcard selector); px font units + customer-controlled number formatting (#656/#657);
  Corner Accents "both corners" toggle.
- **D-16:** saved colour/fx overrides still resolve through the existing pickers.
- Shared high-contrast rule wired (`src/shared/highContrast.ts`).

## Offer listing corrected alongside this submission

The live Description claimed *"High contrast mode and keyboard navigation support"*. High contrast
is implemented; **keyboard navigation is not** — `src/` has no `keydown`/`keyup`/`tabindex`/`aria`
handling. The claim is removed from the listing. No code change; the copy had drifted.

## Pending fixes riding this wave

None outstanding.
