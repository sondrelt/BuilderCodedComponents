# Builder — Appfarm Coded Components

> **Always operate under the `ponytail` skill (full mode)** — see `.claude/skills/ponytail/SKILL.md`. Lazy = efficient: climb the YAGNI ladder, shortest working diff, mark deliberate simplifications with `ponytail:` comments. Stays on unless told "stop ponytail" / "normal mode".

This repo is the source of truth for all Appfarm coded components. Each component lives in its own folder under `components/`. The code is hand-pasted into Appfarm Create; there is no automated sync.

## Appfarm documentation

- **Docs home**: https://docs.appfarm.io/
- **UI components**: https://docs.appfarm.io/library/ui-components
- **★ Coded component**: https://docs.appfarm.io/library/ui-components/coded-component
- **★ Coded component examples**: https://docs.appfarm.io/library/ui-components/coded-component/coded-component-examples

Always refer to these docs when writing or reviewing coded component code. The coded component docs are the primary reference for everything below.

---

## Coded component — how it works

A coded component is an advanced escape hatch for when standard Appfarm components are insufficient (maps, audio/video, 3D viewers, third-party widgets). It consists of three parts edited in Appfarm Create:

- **HTML Content** — markup only, no `<script>` tags, no DOCTYPE. Content is wrapped in a `div`.
- **Script** — vanilla JavaScript. No `import` statements. DOM is ready when the script runs.
- **CSS** — prefix selectors with the component's Element ID to avoid bleeding into other components.

### The `appfarm` namespace

The global `appfarm` object is the only bridge between the component and the platform:

```js
appfarm.element          // root DOM element for this component instance
appfarm.data.<name>      // connected data source or value
appfarm.actions.<name>() // call an exposed action (returns a Promise)
appfarm.on('unload', fn) // cleanup — remove listeners here
```

### Reading data

```js
// Read once
const value = appfarm.data.userInput.get()

// React to changes
appfarm.data.userInput.on('change', (value) => {
    appfarm.element.querySelector('#output').innerHTML = value
})
```

Data sources return an object (single) or array (many). You cannot write to a data source directly — use an Action with parameters instead.

### Writing data / calling actions

```js
appfarm.actions.updateAnimal({ id: '...', age: 10 })
    .then(() => console.log('done'))
    .catch((err) => console.error(err))
```

### External libraries

Add Script URL / Stylesheet URL in the component's **Resources** section. Libraries load into global scope (e.g. `mapbox`, `rive`, `dayjs`). The domain must be whitelisted in the environment's Content Security settings. Load order matters when there are dependencies between libraries.

### Naming — always confirm before editing

Appfarm attribute names (fields on data source objects) and action input parameter names are defined separately in the platform and can differ from each other and from what the code currently uses. **Never assume a name — always ask the user to confirm the exact attribute name and action parameter name before making changes.**

### Key constraints

- No `import` statements in Script.
- Cannot write to data sources directly — always go through Actions.
- CSS must be scoped to the component's Element ID to avoid side effects.
- External library domains require CSP whitelisting per environment.
- `querySelector` and similar DOM methods return `Element | null`, which lacks element-specific properties (`.value`, `.checked`, `.src`, etc.). Always cast to the concrete type with a JSDoc annotation:
  ```js
  const input = /** @type {HTMLInputElement} */ (el.querySelector('input'));
  ```

---

## Folder layout

```
components/
  <component-name>/
    index.js        ← Script tab in Appfarm Create (paste here)
    styles.css      ← CSS tab in Appfarm Create (paste here)
    template.html   ← HTML Content tab in Appfarm Create (paste here)
    component.json  ← metadata: name, version, app, inputs, actions, last synced
    CHANGELOG.md    ← log every change before pasting into Appfarm
```

Each file maps to one tab in the Appfarm Create coded component editor. Paste them separately — they are independent fields.

## Versioning

Git tags follow the pattern `<component-name>@<semver>`, e.g. `date-picker@1.2.0`.

To revert a component to a previous version:
```
git checkout date-picker@1.1.0 -- components/date-picker/index.js
```
Then paste the restored `index.js` into Appfarm Create and update `lastSynced`.

## Branch convention

`master` is the source of truth for what is live in Appfarm Create — only commits that have been pasted go here. All in-progress work lives on a feature branch until it is ready to sync.

```
master                        ← tagged, synced versions only
feat/<component-name>         ← active development, not yet pasted
```

## Workflow for every change

**Starting a change:**
```bash
git checkout -b feat/<component-name>
# edit index.js, styles.css, template.html
git commit -m "<component-name>: <version> — <short description>"
```

**When ready to paste into Appfarm:**
```bash
git checkout master
git merge feat/<component-name>
git tag <component-name>@<version>
# paste each file into Appfarm Create
# update lastSynced in component.json to current ISO timestamp
git commit -m "<component-name>: set lastSynced <date>"
git branch -d feat/<component-name>
```

Commit message format: `<component-name>: <version> — <short description>`
Example: `resource-graph: 1.1.0 — add filter persistence across re-renders`

## Platform context

- **Platform**: Appfarm Create (no-code/visual)
- **Component type**: Coded Component — vanilla JS, not a React component
- **Environments**: Development → Test → Staging → Production
- **Naming convention**: Data-centric (name after the concept, not the function)

## Adding a new component

Copy `components/_template/` to `components/<your-component-name>/`, fill in `component.json`, write the component in `index.js`, then follow the workflow above.

---

## Email notification architecture

Notifications run as two decoupled stages, each backed by its own data source acting as a durable outbox — an event isn't considered handled until its row says so, so a crash mid-processing is a retry, not a lost notification.

**1. `NotificationRequest`** — one row per triggering event (e.g. "ad posted"), written by an App action the moment it happens. Holds what's needed to compute *who* gets notified — not the recipient list itself: fan-out criteria (e.g. `adId`), `templateKey`, shared payload fields, and `treated` (false until fan-out has run).

**2. Fan-out Flow** — called directly from the same App action right after the `NotificationRequest` is written (`Run Flow`, passing the new row's id). For each matching/opted-in recipient it creates one `Notification` row (stage 3), then marks `treated = true`. Must be idempotent per recipient (e.g. a unique key on `(requestId, recipientId)`) — if it dies after creating 150 of 300 rows, re-running against the same still-`treated = false` request must not duplicate those 150.

**3. `Notification`** — one row per individual email to send, the fan-out's output: `recipientEmail`, `recipientName`, `templateKey`, `payload`, `status` (Pending/Sent/Failed).

**4. Sending Flow** — schedule-triggered via a cron **Schedule configured directly in the Flow's own Triggers section** (native to Flows since Appfarm release 148 — no Service involved). This is also *why* it has to be poll-based rather than called with an id: a schedule-triggered Flow action can't receive input, only what's already in storage. It `Foreach`s over `Notification` rows with `status = Pending` (capped per run), resolves the `EmailTemplate`, substitutes `{{variables}}`, calls the built-in **Send Email** action node, and updates `status`.

Splitting fan-out from sending means a slow/rate-limited email provider never blocks the action that triggered the notification (e.g. posting an ad), and a crashed fan-out doesn't leave emails silently unsent with no record anything was supposed to happen.

## Email templates

The **Send Email** action node does no templating/interpolation of its own — it only accepts final HTML/text strings — so template content used by the sending Flow above is a hand-maintained asset, version-controlled here the same way coded components are, in a sibling top-level folder.

### Folder layout

```
email-templates/
  <template-name>/
    template.json   ← metadata: name, version, description, subject, variables, last synced
    body.html        ← paste into the EmailTemplate data source record's HTML body field
    body.txt         ← plain-text fallback (required — Message (text) is mandatory), paste into the record's text body field
    CHANGELOG.md      ← log every change before pasting into Appfarm
```

Placeholders in `body.html`, `body.txt`, and `template.json`'s `subject` use `{{variableName}}` syntax. Appfarm does not evaluate these — the sending Flow does plain string substitution before calling Send Email. `template.json`'s `variables` array is the explicit contract for which tokens a template expects; there's no compiler to catch a typo'd placeholder, so keep it in sync by hand with both the template body and whatever builds the `Notification.payload`.

Email clients don't reliably support external/`<style>` CSS — use inline styles in `body.html`.

### Versioning & workflow

Same mechanics as components:

- Git tags: `<template-name>@<semver>`, e.g. `welcome-email@1.0.0`.
- Branches: `feat/email-<template-name>-<short-desc>` (include a short description, not just the bare template name — the same branch name gets reused across unrelated changes over time otherwise).
- Commit format: `email-templates/<template-name>: <version> — <short description>`.
- "Paste into Appfarm" means writing `body.html`/`body.txt`/`subject` into the `EmailTemplate` data source record, then bumping `lastSynced` in `template.json` and committing `email-templates/<template-name>: set lastSynced <date>`.

### Adding a new template

Copy `email-templates/_template/` to `email-templates/<your-template-name>/`, fill in `template.json` (including `variables`), write `body.html` and `body.txt`, then follow the workflow above.
