# Changelog

## layout 1.0.0 — 2026-07-28

- Extracted from the old `_template/body.html`/`body.txt` header/footer chrome into a shared shell with a `{{content}}` slot.

## standard-body 1.0.0 — 2026-07-28

- Extracted from the old `_template/body.html`/`body.txt` content area (paragraph + button) into a shared fallback fragment, used by the Sending Flow when a template's `EmailTemplate` row body fields are left empty.
