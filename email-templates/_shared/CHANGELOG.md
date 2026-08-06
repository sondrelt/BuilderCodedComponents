# Changelog

## layout 1.1.0 — 2026-08-06

- Content panel background changed from cream (`#fff7ee`) to white (`#ffffff`); outer background changed to `#feefdc`.
- Header text changed to "BUILDER | Varsel".

## standard-body 1.1.0 — 2026-08-06

- Stronger visual hierarchy: bigger bold greeting, thin divider line separating it from the body paragraph, button centered with larger padding/radius. Plain-text fragment gets a matching dashed divider under the greeting.
- Renamed placeholder `{{body}}` → `{{mainSection}}` (html, txt, variables list).

## layout 1.0.0 — 2026-07-28

- Extracted from the old `_template/body.html`/`body.txt` header/footer chrome into a shared shell with a `{{content}}` slot.

## standard-body 1.0.0 — 2026-07-28

- Extracted from the old `_template/body.html`/`body.txt` content area (paragraph + button) into a shared fallback fragment, used by the Sending Flow when a template's `EmailTemplate` row body fields are left empty.
