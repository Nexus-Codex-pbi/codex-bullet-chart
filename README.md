# Codex Bullet Chart

## Overview
A bullet chart visual that displays a primary measure (actual) compared to a target value, with qualitative ranges (poor, acceptable, good) and optional maximum scale. Designed for performance tracking against goals.

## Features
- Displays actual value as a bar, target as a tick line, and qualitative ranges as background bands
- Supports horizontal and vertical orientation
- Configurable qualitative ranges (poor, acceptable, good) with customizable thresholds and colors
- Optional maximum value to set the scale (auto-calculated if not provided)
- Sort order control for custom row sequencing
- Value display option showing the actual value numerically
- Full formatting control for bar, target, ranges, labels, axis, and background
- Tooltips showing category, actual, target, and maximum on hover
- Click to cross-filter other visuals by category
- Right-click context menu for cross-filtering and other interactions
- High contrast mode support
- Responsive layout with scrolling when container is too small
- Supports keyboard focus and screen readers

## Data Roles
| Role | Display Name | Kind | Required? | Data Type | Description |
|------|--------------|------|-----------|-----------|-------------|
| category | Category | Grouping | No (max 1) | Text or Grouping | Row label (e.g. Beat name or Battery code) |
| actual | Actual | Measure | Yes (max 1) | Numeric | The primary bar value |
| target | Target | Measure | Yes (max 1) | Numeric | Target marker line |
| maximum | Maximum | Measure | No (max 1) | Numeric | Full scale maximum (optional, auto-calculated if omitted) |
| sortOrder | Sort Order | Measure | No (max 1) | Numeric | Custom sort order (ascending). If omitted, rows keep their original order. |

Note: Actual and Target are required for meaningful display. Each role can have at most one field bound.

## Formatting Options
The visual provides the following format pane cards:

### Bullet Settings
- Orientation: Horizontal or Vertical
- Bar Color: Fill color of the actual value bar
- Target Color: Color of the target marker line
- Target Width: Width of the target line in pixels
- Bar Height: Height of the actual value bar in pixels
- Row Height: Total height of each bullet row in pixels
- Show Value: Toggle visibility of the actual value label
- Value Format: Number, Percent, or Currency (for the value label)
- Value Color: Text color of the value label
- Value Font Size: Font size of the value label in pixels

### Qualitative Ranges
- Enabled: Toggle visibility of the qualitative range bands
- Poor Threshold: Upper limit of the poor range (as a percentage of maximum)
- Acceptable Threshold: Upper limit of the acceptable range (as a percentage of maximum)
- Poor Color: Fill color for the poor range
- Acceptable Color: Fill color for the acceptable range
- Good Color: Fill color for the good range

### Background Bar
- Transparent: Toggle background bar transparency
- Color: Fill color of the background bar (when not transparent)

### Label Settings
- Show: Toggle visibility of category labels
- Font Size: Font size of category labels in pixels
- Color: Text color of category labels

### Axis Settings
- Show: Toggle visibility of the axis (tick marks and line)
- Tick Count: Number of tick marks on the axis
- Font Size: Font size of axis tick labels in pixels
- Color: Text color of axis tick labels
- Axis Label: Label for the axis (shown opposite the category labels)
- Label Font Size: Font size of the axis label in pixels
- Gridlines: Toggle visibility of axis gridlines
- Gridline Color: Color of axis gridlines
- Gridline Width: Width of axis gridlines in pixels
- Show Axis Titles: Toggle visibility of axis titles
- X Axis Title: Title for the X-axis (value axis)
- Y Axis Title: Title for the Y-axis (category axis)

## How to Use
1. Import the `.pbiviz` file into Power BI Desktop (from the Visuals pane -> ... -> Import from file).
2. Locate the visual in the Visualizations pane and add it to the report canvas.
3. Bind data to the data roles:
   - Category: Required for row labels (text or grouping field)
   - Actual: Required numeric measure for the primary value
   - Target: Required numeric measure for the target line
   - Optional: Maximum (numeric field to set the scale; if omitted, scale is auto-calculated)
   - Optional: Sort Order (numeric field to control row order)
4. Use the format pane to adjust appearance:
   - Set orientation, colors, dimensions, and ranges
   - Configure labels, axis, and background
   - Choose value format and visibility
5. Interact:
   - Click a bullet row to cross-filter other visuals by that category
   - Right-click for the context menu
   - Hover to see a tooltip with category, actual, target, and maximum

## Limitations
- The visual expects numeric values for Actual, Target, and Maximum. Non-numeric values are treated as zero.
- If Actual or Target is missing or non-numeric, the row is not displayed.
- Maximum, if provided, must be numeric and greater than zero; otherwise, auto-calculation is used.
- Sort Order, if bound, must be numeric; non-numeric values are treated as zero.
- Each data role accepts only one field.
- The visual uses a data reduction algorithm (top 30,000 rows) which may limit the number of rows displayed.
- Qualitative range thresholds must be between 0 and 100 (representing percentage of maximum).
- The visual does not support drill-through or bookmark selection.

## Support
For help or questions, visit https://nexuscodex.nexus/support