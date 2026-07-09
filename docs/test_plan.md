# Test Plan – Codex Bullet Chart

## 1. Functional Tests
- [ ] Visual loads without errors
- [ ] Visual renders with sample data
- [ ] Visual handles empty data gracefully
- [ ] All format pane options apply correctly
- [ ] Selection / cross-filter works (if applicable)
- [ ] Tooltips appear on hover

## 2. Performance Tests
- [ ] update() completes < 250ms
- [ ] No memory leaks
- [ ] Bundle size < 2.5 MB

## 3. Accessibility Tests
- [ ] Keyboard navigation works
- [ ] High contrast mode supported
- [ ] ARIA labels present
- [ ] No flashing content

## 4. Security Tests
- [ ] No external network calls
- [ ] No telemetry
- [ ] No external scripts or fonts
- [ ] No DOM escape or eval

## 5. Packaging Tests
- [ ] pbiviz builds successfully
- [ ] Bundle size < 2.5 MB
- [ ] capabilities.json valid

## 6. Sample PBIX Verification
- [ ] Demonstrates all features
- [ ] Demonstrates formatting options
- [ ] Demonstrates interactions

## 7. Outer Background Transparency (TRANS-01/02)
- [ ] Background card exposes Colour + Transparency (0-100) controls
- [ ] Transparency 0 = opaque; Transparency 100 = fully transparent outer container
- [ ] Transparency 100 matches the pre-upgrade default (container was never painted before this plan) — old saved reports render pixel-identical
- [ ] Verified in both light and dark report themes

## 8. Background Bar — Bool-to-Numeric Migration (D-03/D-06, TRANS-01/02)
- [ ] Background Bar card format pane shows only Color + Transparency (the old Transparent toggle no longer appears)
- [ ] Transparency slider 0 = opaque background bar (old default, pixel-identical to pre-upgrade)
- [ ] Transparency slider 50 = half-transparent background bar
- [ ] Transparency slider 100 = fully transparent background bar
- [ ] **OLD-REPORT MIGRATION**: open a report saved BEFORE this upgrade with `backgroundBar.transparent: true` (and the new `transparency` slider absent/at its default 0) — the background bar renders as fully transparent (migrated to 100), not as an opaque default-colour rect
- [ ] A saved report with `backgroundBar.transparent: false` (or unset) and no `transparency` value renders the opaque default colour, unchanged from before
- [ ] Once the new Transparency slider is explicitly set on a report, its value always wins over the old boolean going forward
- [ ] Background bar rect is present in the DOM at all transparency levels (never omitted at 100%) — verify via inspecting the SVG when Qualitative Ranges is disabled
- [ ] Verified on BOTH orientations (Horizontal and Vertical) — both render call sites must behave identically

## 9. Conditional Formatting / fx (TRANS-04)
- [ ] Bar Color swatch (Bullet Settings card) shows the fx button in the format pane
- [ ] Setting a rule on Bar Color resolves per-row via the row's own category instance
- [ ] Rows without a rule override still show the static Bar Color swatch value

## 10. Theme Verification
- [ ] Outer background, background-bar transparency, and Bar Color fx all verified in both light and dark report themes
- [ ] High contrast mode: outer background is suppressed (transparent), background bar and bar colour fall back to the high-contrast palette, unaffected by transparency/fx settings