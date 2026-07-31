# Changelog

## 1.2.0 — 2026-07-31

- Removed the Revert button and its handler — Save/reload is now the only way to discard in-progress edits.

## 1.1.2 — 2026-07-31

- Fixed: `hasText` was computed from the text data source's *current value* (`null` for any record that has never had text saved), not from whether it's bound — this silently skipped attaching the input listener, so typed text never reached `state.text`/the save payload on a first-time edit. Now based on binding presence instead.
- Fixed CSS: `.eht-field[hidden]` rule so the text row is actually hidden when unbound, instead of `display: flex` (higher specificity than the `[hidden]` UA rule) always showing it.

## 1.1.1 — 2026-07-31

- `save` payload always includes both `html` and `text` (unconditionally), matching the action's fixed 2-param signature — previously `text` was omitted when this instance had no text field bound.

## 1.1.0 — 2026-07-28

- `save` now takes `{ html, text? }` — no `id` (actions are contextual to the record this instance is placed on).

## 1.0.1 — 2026-07-28

- Removed `subject` — it's plain metadata, not HTML, and belongs in Appfarm's normal field editor instead of this component.

## 1.0.0 — 2026-07-28

- Initial version. Generic HTML/text/subject editor with a live composed preview, placed once per email content class (EmailLayout, EmailTemplateStandard, EmailTemplate) with different Input bindings. Mode (layout / standard / template) is inferred from which optional reference inputs (`layoutHtml`, `standardHtml`) are bound.
