# Local component preview

Render any coded component in a browser against mock data — no Appfarm, no build step.

## Run

From the repo root, start any static server, then open `dev/preview.html`:

```bash
npx serve .        # → http://localhost:3000/dev/preview.html
# or
python -m http.server 8000   # → http://localhost:8000/dev/preview.html
```

Open with no query for the component list, or jump straight to one:
`…/dev/preview.html?c=resource-req-v2`. Reload to switch components.

A static server is required — the loader `fetch`es the component files, which `file://` blocks.

## How it works

- `preview.html` — host page + `#component-root` wrapper.
- `harness.js` — mocks the global `appfarm`: `data.<name>.get()/.on('change')` from fixtures,
  `actions.<name>()` logs its params to the console and resolves (no mutation), then injects the
  component's `template.html` / `styles.css` / `index.js` (and any `externalResources` CDN libs).
- `fixtures/<component>.js` — mock data per component, keyed by the binding names the component's
  `index.js` actually reads. Enum/reference fields use real DB ids
  (e.g. `source: 20` = Egne, `workType: 250` = Tømrer).

## Limits

Static render only: actions don't persist, so optimistic-UI round-trips (create/resize/delete
showing the change stick) aren't exercised — calls just log. `[harness] no fixture for data source: X`
is a harmless note when a component subscribes to a name it never reads.
