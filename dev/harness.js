// Local preview harness for Appfarm coded components.
// Mocks the injected `appfarm` global, injects a component's template/css/js,
// and feeds it mock data from dev/fixtures/<component>.js. Static, no build step.
//
// Usage: served from repo root, open dev/preview.html?c=<component-name>.

const COMPONENTS = [
  'resource-graph',
  'resource-graph-v2',
  'resource-req-phasingOut',
  'assignment-grid',
  'resource-req-v2',
];

// ponytail: only _set is unused today (static render); it's the round-trip hook.
function makeDataSource(value) {
  const listeners = [];
  return {
    get: () => value,
    on: (evt, cb) => { if (evt === 'change') listeners.push(cb); },
    _set: (v) => { value = v; listeners.forEach((cb) => cb(value)); },
  };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

function injectExternal(url) {
  if (/\.css(\?|$)/i.test(url)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
    return Promise.resolve();
  }
  return loadScript(url);
}

function renderLanding() {
  const root = document.getElementById('component-root');
  root.innerHTML =
    '<h1>Component preview</h1><ul>' +
    COMPONENTS.map((c) => `<li><a href="?c=${c}">${c}</a></li>`).join('') +
    '</ul>';
}

async function loadComponent(c) {
  const base = `../components/${c}`;
  const meta = await fetch(`${base}/component.json`).then((r) => r.json());

  // External libs (Chart.js, ApexCharts, MDI font) must be ready before index.js.
  for (const url of meta.externalResources || []) {
    await injectExternal(url);
  }

  const [tpl, css] = await Promise.all([
    fetch(`${base}/template.html`).then((r) => r.text()),
    fetch(`${base}/styles.css`).then((r) => r.text()),
  ]);

  document.getElementById('component-root').innerHTML = tpl;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const fixtures = (window.FIXTURES && window.FIXTURES[c]) || {};

  // data is a Proxy so a component reads any binding name straight off its
  // fixture — independent of component.json's (sometimes stale) inputs list.
  // Unknown names get an empty data source + a one-time warning.
  const sources = {};
  const data = new Proxy({}, {
    get: (_t, name) => {
      if (typeof name !== 'string') return undefined;
      if (!(name in sources)) {
        if (!(name in fixtures)) console.warn('[harness] no fixture for data source:', name);
        sources[name] = makeDataSource(fixtures[name]);
      }
      return sources[name];
    },
  });

  window.appfarm = {
    element: document.getElementById('component-root'),
    data,
    actions: new Proxy({}, {
      get: (_t, name) => (params) => {
        console.log('[action]', String(name), params);
        return Promise.resolve();
      },
    }),
    on: () => {}, // unload no-op: one component per page load
  };

  // index.js runs last, with appfarm + template + libs all in place.
  await loadScript(`${base}/index.js`);
}

const c = new URLSearchParams(location.search).get('c');
if (!c) {
  renderLanding();
} else if (!COMPONENTS.includes(c)) {
  document.getElementById('component-root').textContent = `Unknown component: ${c}`;
} else {
  // Fixtures define window.FIXTURES[c]; load it before wiring appfarm.
  loadScript(`fixtures/${c}.js`)
    .then(() => loadComponent(c))
    .catch((err) => {
      console.error(err);
      document.getElementById('component-root').textContent = String(err);
    });
}
