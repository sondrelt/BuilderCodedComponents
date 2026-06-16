# Builder — Appfarm Coded Components

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

### Key constraints

- No `import` statements in Script.
- Cannot write to data sources directly — always go through Actions.
- CSS must be scoped to the component's Element ID to avoid side effects.
- External library domains require CSP whitelisting per environment.

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
Example: `resource-demand-chart: 1.1.0 — add filter persistence across re-renders`

## Platform context

- **Platform**: Appfarm Create (no-code/visual)
- **Component type**: Coded Component — vanilla JS, not a React component
- **Environments**: Development → Test → Staging → Production
- **Naming convention**: Data-centric (name after the concept, not the function)

## Adding a new component

Copy `components/_template/` to `components/<your-component-name>/`, fill in `component.json`, write the component in `index.js`, then follow the workflow above.
