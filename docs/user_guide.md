# User Guide – Codex Bullet Chart

## Overview
Stephen Few bullet chart with actual vs target and qualitative colour bands. Displays performance data with a primary measure (actual) compared to a target, optionally against qualitative ranges (poor, acceptable, good) and a maximum scale.

## 1. Adding the Visual
1. Import the `.pbiviz` file into Power BI Desktop
2. Locate the visual in the Visualizations pane
3. Drag it onto the report canvas

## 2. Data Binding
- **Category** (Required): Row label (e.g. Beat name or Battery code). Each unique value creates a row.
- **Actual** (Required): The primary bar value (numeric).
- **Target** (Optional): Target marker line (numeric). If not bound, no target line is shown.
- **Maximum** (Optional): Full scale maximum (numeric, optional). If omitted, the maximum is auto-calculated as 1.2 times the greater of actual or target.
- **Sort Order** (Optional): Custom sort order (numeric, ascending). If bound, rows are sorted by this value; otherwise, original order is kept.

## 3. Formatting Options
**Bullet Settings**
- Orientation: Horizontal or Vertical.
- Bar Color: Colour of the actual value bar.
- Target Color: Colour of the target line.
- Target Width: Thickness of the target line (px).
- Bar Height: Height of the actual bar (px).
- Row Height: Total height of each row (px).
- Show Value: Toggle display of the actual value as text.
- Value Format: Number, Percent, or Currency (applies when Show Value is enabled).
- Value Color: Colour of the value text.
- Value Font Size: Size of the value text.

**Qualitative Ranges**
- Enabled: Toggle display of qualitative background ranges.
- Poor Threshold: Percentage (0-100) for the poor range (e.g., 60).
- Acceptable Threshold: Percentage (0-100) for the acceptable range (e.g., 80).
- Poor Color: Colour for the poor range.
- Acceptable Color: Colour for the acceptable range.
- Good Color: Colour for the good range.

**Background Bar**
- Transparent: If on, the background bar is transparent; otherwise, shows a solid colour.
- Color: Colour of the background bar (when Transparent is off).

**Label Settings**
- Show: Toggle display of the category labels.
- Font Size: Size of the category text.
- Color: Colour of the category text.

**Axis Settings**
- Show: Toggle visibility of the axis (value axis).
- Tick Count: Number of tick marks on the axis.
- Font Size: Size of the axis tick labels.
- Color: Colour of the axis text.
- Axis Label: Title for the axis (e.g., 'Units').
- Label Font Size: Size of the axis title text.
- Gridlines: Toggle display of gridlines.
- Gridline Color: Colour of the gridlines.
- Gridline Width: Width of the gridlines (px).
- Show Axis Titles: Toggle visibility of axis titles.
- X Axis Title: Title for the horizontal axis (when orientation is horizontal).
- Y Axis Title: Title for the vertical axis (when orientation is vertical).

## 4. Features
- Horizontal or vertical layout.
- Actual value bar compared to a target line.
- Qualitative colour ranges (poor/acceptable/good) configurable via thresholds.
- Optional background bar.
- Tooltips on hover showing category, actual, target, and maximum.
- Click a row to cross-filter other visuals by that category (if Category bound).
- Right-click for context menu.
- Supports high contrast mode and keyboard navigation.
- Configurable bar height, row height, colours, and fonts.
- Optional display of the actual value on the bar.
- Sorting by Sort Order field (ascending).
- Automatic maximum calculation if not provided.

## 5. Limitations
- Only the first 30,000 rows are processed (data reduction limit).
- Requires Actual to be numeric; non-numeric rows are skipped.
- Target and Maximum must be numeric if bound; otherwise, they are ignored or auto-calculated.
- Sort Order must be numeric; non-numeric values are placed at the end.
- The visual does not support drill-through or hierarchical categories.
- Qualitative ranges thresholds are percentages of the maximum value (0-100). Values outside this range are clamped.

## 6. Support
For help or questions, visit https://nexuscodex.nexus/support