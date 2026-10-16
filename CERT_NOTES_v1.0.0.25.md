# Codex Bullet Chart — Cert Notes v1.0.0.25

**Addresses:** review of 16 Oct 2026 (v1.0.0.24), Policy **1180.2.4 Data Types** —
"the visual becomes unresponsive with a large dataset (~100,004 rows)".

## Cause

The visual measured text with SVG `getComputedTextLength()` across every row, and read each
value label's `getBBox()` inside the row loop. Each read forces a browser layout of the growing
chart, so render time grew with the square of the row count.

## Fix

1. Text measurement is bounded to the 64 longest unique strings (exact SVG metrics kept).
2. The per-row label-collision measure uses canvas `measureText` (no layout).
3. Value-label backing boxes are read in one pass after all rows are drawn, then inserted.
4. `dataReductionAlgorithm.top.count` 30000 → **1000**. A bullet chart is read row by row;
   beyond 1,000 rows Power BI applies its standard data reduction and shows its own
   "not all data is shown" indicator.

## Measured (headless Chrome, same harness for every build, dark theme)

| Rows | v1.0.0.24 | v1.0.0.25 |
|---|---|---|
| 2,000 | 7.0 s | 1.5 s |
| 4,000 | 20.0 s | 3.1 s |
| 1,000 (new cap) | 2.3 s | 0.86 s |

Data Types battery on v1.0.0.25 at 1,000 rows: numbers, null values, null categories,
negative values and very large numbers (1e14) all render without error in under 0.9 s.

## Also

- `npm audit fix` (brace-expansion advisory, devDependency only): `npm audit` reports 0 vulnerabilities.
- No network calls, no `eval`, no `innerHTML` added. Production GUID unchanged.
