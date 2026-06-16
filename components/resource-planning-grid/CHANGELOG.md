# Changelog

## 1.0.0 — 2026-06-16

- Initial version
- Multi-project grid with one section per project
- Aggregated summary row per source type (behov, egne, innleide, utleide, udekt, overskudd)
- Expandable work-type detail rows (toggled via toggleDetails action)
- Inline editing for behov, innleide, utleide — calls updateResourceReq + startSaveTimer on input
- Optimistic local aggregation: udekt/overskudd recalculate instantly without a server round-trip
- Read-only styling for derived rows (udekt, overskudd) and egne
- Arrow key navigation across editable cells
- Focus key persisted to sessionStorage so position is restored after grid rebuild
- Magnify button on last week column for popover sources (udekt, overskudd, utleide, innleide)
- External dependency: MDI icon font via CDN (add as Stylesheet URL in Appfarm Create)
