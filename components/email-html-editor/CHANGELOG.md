# Changelog

## 1.1.0 — 2026-07-28

- `save` now takes `{ html, text? }` — no `id` (actions are contextual to the record this instance is placed on).

## 1.0.1 — 2026-07-28

- Removed `subject` — it's plain metadata, not HTML, and belongs in Appfarm's normal field editor instead of this component.

## 1.0.0 — 2026-07-28

- Initial version. Generic HTML/text/subject editor with a live composed preview, placed once per email content class (EmailLayout, EmailTemplateStandard, EmailTemplate) with different Input bindings. Mode (layout / standard / template) is inferred from which optional reference inputs (`layoutHtml`, `standardHtml`) are bound.
