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

## 11. Visual Title (TITLE-01, Phase 1 Plan 13)
- [ ] Title card appears in the format pane ("Visual Title") with Show Title (off by default), Title Text, Font, Alignment, Font Color
- [ ] Show Title off (default) renders no title and reserves no extra vertical space — old saved report (no title properties set) is pixel-identical to pre-upgrade (D-06)
- [ ] Show Title on + Title Text set renders the title above the chart in BOTH Horizontal and Vertical orientation, reserving vertical space (rows/axis shift down)
- [ ] Title Font (family/size/bold/italic/underline) and Alignment (left/center/right, mapped to text-anchor) apply correctly
- [ ] Title Font Color applies; high contrast mode overrides to the theme foreground colour
- [ ] Gridlines and axis ticks in both orientations correctly start below the reserved title area, not through it

## 12. Per-Surface Text Treatment (TEXT-01, Phase 1 Plan 13)
- [ ] Labels card: new Font control (Family/Bold/Italic/Underline, reusing existing Font Size) applies to the category label (`.bullet-label`) in both orientations; Bold on (default) renders the pre-existing font-weight 600
- [ ] Axis card: new Font control (Family/Bold/Italic/Underline, reusing existing Font Size) applies to axis tick labels (`.bullet-axis-label`) in both orientations; Bold off (default) renders the pre-existing unset/normal weight
- [ ] Axis Label (optional axis title text) and Axis Titles (showAxisTitles feature) are unchanged (out of this plan's per-surface scope) — still render at hardcoded font-weight 600
- [ ] Alignment controls deliberately omitted on Labels/Axis — text-anchor is already layout-determined per orientation
- [ ] Qualitative range fill colours (Poor/Acceptable/Good) and background-bar colour logic are unaffected — verified unchanged via `git diff`

## 13. Text-Colour fx (TEXT-02, Phase 1 Plan 13)
- [ ] fx button appears next to Value Color swatch in the format pane (Bullet Settings card)
- [ ] Binding a measure to a conditional formatting rule on Value Color changes the end-of-bar data-label colour per row/category, in both orientations
- [ ] Rows without a rule override fall back to the static Value Color swatch value
- [ ] Bar Color fx (pre-existing from Plan 08) continues to work unchanged, distinct from the new data-label-colour fx

## 14. Render-Nothing Defaults (D-06)
- [ ] Old saved report with none of the new title/font/alignment properties set renders pixel-identical to pre-upgrade: no title, category labels at weight 600, axis tick labels at normal weight, all at prior default sizes/colours/positions, in both orientations
## 15. v2 Board Look — Band-Engine Measure (LOOK-03, Phase 1 Plan 17)
- [ ] With Bar Color at its shipped default and a Target bound: each measure bar tints via the shared band law — at/over target renders the success token, within 90% the warning token, below the danger token — so a column of bullets reads as a RAG column at a glance, in both orientations
- [ ] Measure bar renders the beveled 3-stop gradient (light/base/dark, mirrors accentBarGradient) with a soft glow on dark backgrounds; glow absent on light backgrounds and under high contrast
- [ ] No Target bound: measure reads neutral-good (success token) per the shared band() contract
- [ ] D-16: a user-changed Bar Color swatch renders exactly that colour (gradient/glow treatment still applies); a per-row Bar Color fx rule overrides both, per row

## 16. v2 Board Look — Violet Target Tick (Phase 1 Plan 17)
- [ ] With Target Color at its shipped default, the target marker renders the suite-wide violet target token (never a band colour), extended past the zone track, rounded, glowing on dark
- [ ] D-16: a user-set Target Color and/or Target Width still resolve exactly; high contrast uses the foreground-selected system slot

## 17. v2 Board Look — Dim Qualitative Ranges (Phase 1 Plan 17)
- [ ] With zone colours at their shipped defaults, Poor/Acceptable/Good render as dim steps: danger/warning/success band tokens at 14% opacity, never competing with the measure
- [ ] D-16: user-set zone colours still resolve (rendered with the same dim-step treatment); high contrast keeps its foreground opacity ladder (0.2/0.4/0.6)

## 18. v2 Board Look — Quantised Mode (Phase 1 Plan 17)
- [ ] Quantised Mode toggle (Bullet Settings, default OFF) renders the measure as discrete blocks — lit blocks in the band/user colour with glow on dark, unlit blocks in the theme track colour — in both orientations; target tick still renders above the blocks
- [ ] Block Count property changes the number of blocks (clamped 4–60, default 20)
- [ ] Default OFF: an old saved report renders the solid measure bar, untouched by the toggle

## 19. v2 Board Look — Signature, Motion, HC (Phase 1 Plan 17)
- [ ] Corner-bracket card signature renders at top-left/bottom-right, accent (cyan) tinted, glowing on dark only; muted grey on the empty/landing state
- [ ] Value labels render with tabular numerals (tnum) at weight 700
- [ ] Measure settles once (≤400ms ease-out) when the data changes — scale-in for the solid bar, fade-in for quantised blocks; resizes and format-pane tweaks do NOT replay it; `prefers-reduced-motion` skips it entirely
- [ ] High contrast: bars/blocks map to system slots, all glow drops, and each band-driven value label carries a status glyph prefix (✓/!/✕) so nothing reads by colour alone
