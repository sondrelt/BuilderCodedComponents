# Changelog

## 1.0.0 — 2026-06-16

- Initial version
- Span-native timeline rendering (bars are positioned by date, not column index)
- Day / week granularity toggle, persisted via `viewGranularity` app variable
- Drag-to-create allocations by clicking an empty lane
- Move and resize existing allocations and absences by dragging
- Absence bars rendered as diagonal-stripe overlay bands above project bars
- Dynamic absence type colours via `absenceColors` data source
- Group-by-project view with PM / site manager role tags
- Summary rows: on project / available / total per column
- Now-line marker
- Search filter across name, work type, and position
- Out-of-viewport spans shown with edge chevrons (no silent truncation)
