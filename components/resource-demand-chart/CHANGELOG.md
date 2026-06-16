# Changelog

## 1.0.0 — 2026-06-16

- Initial version
- Stacked bar chart with line overlay showing weekly resource demand
- Categories: egne ansatte, innleide, utleide, udekt behov, overskudd, behov (line)
- Work type filter dropdown (shows only types in use for active projects)
- Project filter via `projects` data source
- Legend rendered inline with filter pushed to the right
- Reacts to changes in calendarWeeks, perProjectData, projects, workTypes
- External dependency: Chart.js via CDN (add as Script URL in Appfarm Create)
