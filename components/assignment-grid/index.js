// --- Resource Planning — span-native timeline (day / week) ---
// End-of-period ambiguity fixed:
//   • Drag math runs in DATE space, not clamped column indices, so spans that
//     start/end outside the loaded `weeks` window are no longer silently truncated.
//   • Move clamps by shifting the whole span back into range, preserving its
//     length, so long bars can never push `eIdx` past the grid (the old crash).
//   • Saved dateTo is the inclusive end-of-period, and makeBar renders the right
//     edge as end-of-day, so a bar never appears to "end at the start" of its last day.

// ── Module state ───────────────────────────────────────────────
let granularity = 'week';            // 'week' | 'day'
let columns = [];                    // [{ index, start, end, width, left, topLabel, topYear, label }]
let gridWidth = 0;
let rangeStart = null, rangeEnd = null;

let weeksList = [];                  // only used to source the visible window + week labels
let weekDateRanges = {};
let wtNameMap = {};

let projectsById = new Map();
let allocsByResource = new Map();    // resourceId -> [Allocation] (sorted by dateFrom)
let allocById = new Map();

let absencesByResource = new Map();
let absenceById = new Map();

let jobsByWorkType = new Map();      // workType enum value -> [Job] (Builder lease-out ads)

let groupingAnchorDate = null;       // pinned once, for project grouping
let activeDrag = null;               // see onPointerDown for shape
let dragTooltipEl = null;

let absenceTypeMap = {}; // Will dynamically store { value: { name, color } }

const STICKY_W = 380;
const COLW = { week: 75, day: 75 };
const ROW_H = 34;


const MONTHS_NB = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

const RESOURCE_CELL_MARKUP = `
    <div class="resource-info">
        <div class="resource-name"></div>
        <div class="resource-worktype"></div>
        <div class="resource-position"></div>
        <div class="resource-edit-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
        </div>
    </div>`;
let resourceCellTemplate = null;

// ── Utilities ──────────────────────────────────────────────────
const safeGet = (ds) => ds?.get?.() || [];
const resolveId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);
const clampIdx = (i) => Math.max(0, Math.min(columns.length - 1, i));
const DAY_MS = 86400000;

function getContrastColor(hex) {
    if (!hex) return '#1e293b';
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1e293b' : '#ffffff';
}
function getBadgeColor(proj) { return proj?.colorHexCode || '#d1eae0'; }

function getISOWeek(d) {
    const t = new Date(d); t.setHours(0,0,0,0);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    const jan4 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round((+t - +jan4) / 604800000);
}
function getISOWeekYear(d) {
    const t = new Date(d); t.setHours(0,0,0,0);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    return t.getFullYear();
}

// ── Date helpers (Monday-based ISO weeks) ──────────────────────
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeekMon(d){ const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
function endOfWeekMon(d){ const x = startOfWeekMon(d); x.setDate(x.getDate()+6); return endOfDay(x); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function clampDate(d, lo, hi){ const t = +d; return new Date(t < +lo ? +lo : t > +hi ? +hi : t); }

// ── Week / day view-granularity helpers ────────────────────────
function setActiveGranularityButton() {
    document.querySelectorAll('#granularity-toggle button').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-granularity') === granularity));
}

function applyGranularity(value, { write = false } = {}) {
    granularity = (value === 'day' || value === 'week') ? value : 'week';
    setActiveGranularityButton();
    if (write) appfarm.data.viewGranularity?.set?.(granularity);
    buildAll();
}

// ── Work-type enum ─────────────────────────────────────────────
function buildWorkTypeNameMap(data) {
    const map = {};
    (data || []).forEach(i => { if (i?.enum_value != null) map[i.enum_value] = i.enum_name || String(i.enum_value); });
    return map;
}
function resolveWorkTypeName(v) { return (!v && v !== 0) ? '' : (wtNameMap?.[v] ?? String(v)); }

// ── Time axis: window comes from `weeks`, columns are regenerated per granularity ──
function loadTimeAxis() {
    const vs = appfarm.data.viewFrom?.get?.();
    const ve = appfarm.data.viewTo?.get?.();

    rangeStart = startOfWeekMon(vs ? new Date(vs) : new Date());
    rangeEnd   = endOfWeekMon(ve ? new Date(ve) : addDays(rangeStart, 7 * 12));

    // Generate weeksList from the date window instead of reading from Appfarm
    weeksList = [];
    weekDateRanges = {};
    let cur = startOfWeekMon(rangeStart);
    while (cur <= rangeEnd) {
        const wEnd = endOfWeekMon(cur);
        const weekNum = getISOWeek(cur);
        const year = getISOWeekYear(cur);
        weeksList.push({
            weekNumber: weekNum,
            year,
            monthName: MONTHS_NB[cur.getMonth()],
            timestamp: new Date(cur),
            periodEnd: new Date(wEnd)
        });
        weekDateRanges[weekNum] = { start: new Date(cur), end: new Date(wEnd) };
        cur = addDays(cur, 7);
    }
}

function buildColumns() {
    const W = COLW[granularity];
    const cols = [];

    if (granularity === 'week') {
        weeksList.forEach((w, i) => {
            const r = weekDateRanges[w.weekNumber];
            cols.push({ index: i, start: r.start, end: r.end, width: W, left: 0,
                        topLabel: w.monthName, topYear: w.year, label: String(w.weekNumber) });
        });
    } else {
        // Find which week column contains today
        const today = startOfDay(new Date());
        const currentWeekIdx = weeksList.findIndex(w =>
            +today >= +new Date(w.timestamp) && +today <= +new Date(w.periodEnd)
        );
        const anchorIdx = currentWeekIdx >= 0 ? currentWeekIdx : weeksList.length - 1;

        // Start the day window so today sits in column [anchorIdx],
        // matching its position in week view
        const periodStart = startOfDay(new Date(
            appfarm.data.viewFrom?.get?.() ?? rangeStart
        ));
        let cur = startOfDay(addDays(today, -anchorIdx));

        // Clamp: don't start before the period
        if (+cur < +periodStart) cur = periodStart;

        const dayCount = weeksList.length;
        let i = 0;
        while (i < dayCount) {
            cols.push({ index: i++, start: new Date(cur), end: endOfDay(cur), width: W, left: 0,
                        topLabel: MONTHS_NB[cur.getMonth()], topYear: cur.getFullYear(), label: String(cur.getDate()) });
            cur = addDays(cur, 1);
        }
        rangeStart = cols[0].start;
        rangeEnd   = cols[cols.length - 1].end;
    }

    let acc = 0;
    cols.forEach(c => { c.left = acc; acc += c.width; });
    columns = cols;
    gridWidth = acc;
}

// ── Geometry ───────────────────────────────────────────────────
function colIndexForDate(d) {
    const t = +d;
    let lo = 0, hi = columns.length - 1;
    while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (t < +columns[m].start) hi = m - 1;
        else if (t > +columns[m].end) lo = m + 1;
        else return m;
    }
    return t < +columns[0]?.start ? -1 : columns.length; // signal out-of-range side
}
function xForDate(d) {
    const i = colIndexForDate(d);
    if (i < 0) return 0;
    if (i >= columns.length) return gridWidth;
    const c = columns[i];
    const frac = (+d - +c.start) / (+c.end - +c.start);
    return c.left + frac * c.width;
}
function colIndexFromClientX(clientX, trackRect) {
    return clampIdx(Math.floor((clientX - trackRect.left) / COLW[granularity]));
}

// ── Data indexing (groups spans, doesn't expand) ───────────────
function indexData() {
    wtNameMap = buildWorkTypeNameMap(safeGet(appfarm.data.workTypeEnum));
    absenceTypeMap = {};
    safeGet(appfarm.data.absenceColors).forEach(item => {
        if (item?.absenceValue != null) {
            absenceTypeMap[item.absenceValue] = {
                name: item.absenceName || 'Fravær',
                color: item.colorHexCode || '#e5e7eb'
            };
        }
    });
    projectsById = new Map(safeGet(appfarm.data.projects).map(p => [p._id, p]));

    allocsByResource = new Map();
    allocById = new Map();
    safeGet(appfarm.data.allocation).forEach(a => {
        allocById.set(a._id, a);
        const rid = resolveId(a.resource);
        if (!rid) return;
        if (!allocsByResource.has(rid)) allocsByResource.set(rid, []);
        allocsByResource.get(rid).push(a);
    });
    allocsByResource.forEach(list => list.sort((x, y) => +new Date(x.dateFrom) - +new Date(y.dateFrom)));

    absencesByResource = new Map();
    absenceById = new Map();
    safeGet(appfarm.data.absence).forEach(a => {
        absenceById.set(a._id, a);
        const rid = resolveId(a.resource);
        if (!rid) return;
        if (!absencesByResource.has(rid)) absencesByResource.set(rid, []);
        absencesByResource.get(rid).push(a);
    });
    absencesByResource.forEach(list => list.sort((x, y) => +new Date(x.dateFrom) - +new Date(y.dateFrom)));

    // Builder job ads — generic lease-out opportunities, bucketed by work type so each
    // matching resource can surface them in its free gaps.
    jobsByWorkType = new Map();
    safeGet(appfarm.data.jobs).forEach(j => {
        const wt = resolveId(j.workType);   // workType is a reference enum — resolve to its id
        if (wt == null) return;
        if (!jobsByWorkType.has(wt)) jobsByWorkType.set(wt, []);
        jobsByWorkType.get(wt).push(j);
    });
}

// Sub-spans of [from,to] NOT covered by any allocation or absence for this resource.
// ponytail: naive merge-and-subtract, O(intervals) per resource per job; fine for a
// handful of ads — add a spatial index only if job volume explodes.
function freeGapsForResource(resourceId, from, to) {
    const lo = +startOfDay(new Date(from));
    const hi = +endOfDay(new Date(to));
    if (hi <= lo) return [];

    const busy = []
        .concat(allocsByResource.get(resourceId) || [], absencesByResource.get(resourceId) || [])
        .map(r => [+startOfDay(new Date(r.dateFrom)), +endOfDay(new Date(r.dateTo))])
        .filter(([s, e]) => e >= lo && s <= hi)
        .sort((a, b) => a[0] - b[0]);

    const gaps = [];
    let cursor = lo;
    busy.forEach(([s, e]) => {
        if (s > cursor) gaps.push({ from: new Date(cursor), to: new Date(s - 1) });
        if (e > cursor) cursor = e + 1;
    });
    if (cursor <= hi) gaps.push({ from: new Date(cursor), to: new Date(hi) });
    return gaps;
}

function getAnchorDate() {
    if (!groupingAnchorDate) groupingAnchorDate = startOfDay(new Date());
    return groupingAnchorDate;
}
function allocCoveringDate(resourceId, date) {
    const t = +date;
    return (allocsByResource.get(resourceId) || [])
        .find(a => +new Date(a.dateFrom) <= t && t <= +new Date(a.dateTo)) || null;
}

// ── Resource info cell ─────────────────────────────────────────
function getResourceCellTemplate() {
    if (!resourceCellTemplate) {
        resourceCellTemplate = document.createElement('div');
        resourceCellTemplate.className = 'pl-resource';
        resourceCellTemplate.innerHTML = RESOURCE_CELL_MARKUP;
    }
    return resourceCellTemplate;
}
function buildResourceCell(res, role = null) {
    const cell = getResourceCellTemplate().cloneNode(true);
    cell.dataset.resourceId = res._id;
    const wt = resolveWorkTypeName(res.workType);
    const nameEl = cell.querySelector('.resource-name');
    const workEl = cell.querySelector('.resource-worktype');
    const posEl  = cell.querySelector('.resource-position');
    nameEl.textContent = res.fullNameFx || '';  nameEl.title = res.fullNameFx || '';
    workEl.textContent = wt;                     workEl.title = wt;
    posEl.textContent  = res.position || '';     posEl.title  = res.position || '';
    if (role) {
        const tag = document.createElement('span');
        tag.className = `role-tag ${role.tagClass}`;
        tag.textContent = role.label; tag.title = role.label;
        posEl.prepend(tag);
    }
    return cell;
}

// ── Bar (one per Allocation) ───────────────────────────────────
function makeBar(record, kind) {
    const isAbsence = kind === 'absence';
    const proj = isAbsence ? null : projectsById.get(resolveId(record.project));
    const at = isAbsence ? record.absenceType : null;
    const dynamicAbsence = isAbsence ? absenceTypeMap[at] : null;

    const color = isAbsence ? (dynamicAbsence?.color || '#e5e7eb') : getBadgeColor(proj || {});
    const label = isAbsence ? (dynamicAbsence?.name || 'Fravær')
                            : (proj ? (proj.bepmnX || proj.name || 'Prosjekt') : 'Prosjekt');

    // Inclusive period: left = start of the first day, right = end of the last day.
    // Using endOfDay on the right edge removes the "ends at the start of its last
    // day" ambiguity even when the backend stores dateTo as a bare midnight date.
    const recFrom = startOfDay(new Date(record.dateFrom));
    const recTo   = endOfDay(new Date(record.dateTo));
    const left  = xForDate(recFrom);
    const right = xForDate(recTo);

    const clipL = +recFrom < +rangeStart;
    const clipR = +recTo   > +rangeEnd;

    const bar = document.createElement('div');
    bar.className = 'pl-bar' + (isAbsence ? ' pl-bar-absence' : '')
                 + (clipL ? ' pl-clip-l' : '') + (clipR ? ' pl-clip-r' : '');
    bar.style.left = left + 'px';
    bar.style.width = Math.max(right - left, 1) + 'px';
    // Use backgroundColor, NOT the `background` shorthand. The shorthand also
    // writes `background-image: none`, which (being inline) would override the
    // absence band's CSS diagonal stripes (.pl-bar-absence background-image) and
    // leave the band flat. backgroundColor sets only the colour, so the stripes
    // survive. Project bars are unaffected (they have no CSS background-image).
    bar.style.backgroundColor = color;
    bar.style.color = getContrastColor(color);
    bar.dataset.kind = kind;
    if (isAbsence) {
        bar.dataset.absenceId = record._id;
    } else {
        bar.dataset.allocationId = record._id;
        bar.dataset.projectId = resolveId(record.project) || '';
    }
    bar.title = label;
    bar.innerHTML =
        (clipL ? '' : `<span class="pl-handle" data-edge="l"></span>`) +
        `<span class="pl-bar-label"></span>` +
        (clipR ? '' : `<span class="pl-handle" data-edge="r"></span>`);
    bar.querySelector('.pl-bar-label').textContent = label;
    return bar;
}

// Ghost for a Builder job ad sitting in a resource's free gap. Not a real bar:
// dashed, recessive, clickable (opens the ad) — never draggable.
function makeJobGhost(gapFrom, gapTo, jobsInGap) {
    const left  = xForDate(startOfDay(new Date(gapFrom)));
    const right = xForDate(endOfDay(new Date(gapTo)));
    const n = jobsInGap.length;
    const label = n > 1 ? `${n} ledige oppdrag` : (jobsInGap[0].title || 'Oppdrag');
    const count = jobsInGap.reduce((sum, j) => sum + (Number(j.numberOfResources) || 0), 0);

    const ghost = document.createElement('div');
    ghost.className = 'pl-jobad';
    ghost.style.left = left + 'px';
    ghost.style.width = Math.max(right - left, 1) + 'px';
    ghost.dataset.jobId = jobsInGap[0]._id;
    if (n > 1) ghost.dataset.jobIds = jobsInGap.map(j => j._id).join(',');
    ghost.title = count ? `${label} · ${count} stk` : label;
    ghost.innerHTML =
        `<span class="pl-jobad-mark">↗</span>` +
        `<span class="pl-jobad-label"></span>` +
        (count ? `<span class="pl-jobad-count"></span>` : '');
    ghost.querySelector('.pl-jobad-label').textContent = label;
    if (count) ghost.querySelector('.pl-jobad-count').textContent = count;
    return ghost;
}

function makeTrack(res) {
    const resourceId = res._id;
    const track = document.createElement('div');
    track.className = 'pl-track';
    track.dataset.resourceId = resourceId;
    track.style.width = gridWidth + 'px';
    const W = COLW[granularity];
    track.style.backgroundSize = `${W}px 100%`;
    (allocsByResource.get(resourceId) || []).forEach(a => track.appendChild(makeBar(a, 'alloc')));
    (absencesByResource.get(resourceId) || []).forEach(a => track.appendChild(makeBar(a, 'absence')));

    // Surface matching Builder ads in this resource's free gaps. Gaps are computed once
    // over the visible range; each gap renders at most one ghost (multiple ads sharing a
    // gap collapse into a single "N ledige oppdrag" marker) so ghosts never occlude.
    const jobs = jobsByWorkType.get(resolveId(res.workType)) || [];
    if (jobs.length) {
        freeGapsForResource(resourceId, rangeStart, rangeEnd).forEach(gap => {
            const gf = +gap.from, gt = +gap.to;
            const hits = jobs.filter(j =>
                +endOfDay(new Date(j.dateEnd)) >= gf && +startOfDay(new Date(j.dateStart)) <= gt);
            if (!hits.length) return;
            // Clip the ghost to the part of the gap actually covered by the matching ads.
            const from = new Date(Math.max(gf, Math.min(...hits.map(j => +startOfDay(new Date(j.dateStart))))));
            const to   = new Date(Math.min(gt, Math.max(...hits.map(j => +endOfDay(new Date(j.dateEnd))))));
            track.appendChild(makeJobGhost(from, to, hits));
        });
    }
    return track;
}

function renderRow(res, frag, role = null) {
    const row = document.createElement('div');
    row.className = 'pl-row' + (role ? ` ${role.rowClass}` : '');
    row.appendChild(buildResourceCell(res, role));
    row.appendChild(makeTrack(res));
    frag.appendChild(row);
}

function groupHeader(label, color) {
    const row = document.createElement('div');
    row.className = 'pl-grouphead';
    row.style.width = (STICKY_W + gridWidth) + 'px';
    row.style.setProperty('--proj-color', color);   // left stripe + muted tint (CSS)
    const inner = document.createElement('div');
    inner.className = 'pl-grouphead-label';
    inner.textContent = label;
    row.appendChild(inner);
    return row;
}

// Full-width line in the project colour closing a group — scrolls with the grid so
// the boundary reads across the whole timeline.
function groupSep(color) {
    const sep = document.createElement('div');
    sep.className = 'pl-group-sep';
    sep.style.width = (STICKY_W + gridWidth) + 'px';
    sep.style.setProperty('--proj-color', color);
    return sep;
}

// ── Header (month groups + column labels) ──────────────────────
function buildHeader(inner) {
    const today = new Date();
    const header = document.createElement('div');
    header.className = 'pl-header';

    const corner = document.createElement('div');
    corner.className = 'pl-corner';
    header.appendChild(corner);

    const axis = document.createElement('div');
    axis.className = 'pl-axis';
    axis.style.width = gridWidth + 'px';

    // month row
    const months = document.createElement('div');
    months.className = 'pl-months';
    let g = null;
    columns.forEach(c => {
        if (!g || g.topLabel !== c.topLabel || g.topYear !== c.topYear) {
            const cell = document.createElement('div');
            cell.className = 'pl-month';
            cell.textContent = `${c.topLabel} '${String(c.topYear).slice(-2)}`;
            g = { topLabel: c.topLabel, topYear: c.topYear, n: 0, el: cell };
            months.appendChild(cell);
        }
        g.n++;
        g.el.style.width = (g.n * COLW[granularity]) + 'px';
    });

    // column-label row
    const colRow = document.createElement('div');
    colRow.className = 'pl-cols';
    columns.forEach(c => {
        const cell = document.createElement('div');
        cell.className = 'pl-col';
        cell.style.width = c.width + 'px';
        cell.textContent = c.label;
        if (today >= c.start && today <= c.end) cell.classList.add('current');
        colRow.appendChild(cell);
    });

    axis.appendChild(months);
    axis.appendChild(colRow);
    header.appendChild(axis);
    inner.appendChild(header);
}

// ── Summary rows (derived from spans) ──────────────────────────
function buildSummary(inner, filtered) {
    const total = filtered.length;
    const assigned = new Array(columns.length).fill(0);

    filtered.forEach(res => {
        (allocsByResource.get(res._id) || []).forEach(a => {
            const proj = projectsById.get(resolveId(a.project));
            if (proj?.absenceType) return;
            const s = clampIdx(colIndexForDate(new Date(a.dateFrom)));
            const e = clampIdx(colIndexForDate(new Date(a.dateTo)));
            for (let i = s; i <= e; i++) assigned[i] = (assigned[i] || 0) + 1;
        });
    });

    const rows = [
        { label: 'På prosjekt', cls: 'summary-assigned', val: i => assigned[i] },
        { label: 'Ledige',      cls: 'summary-ledig',    val: i => total - assigned[i] },
        { label: 'Totalt',      cls: 'summary-total',    val: () => total },
    ];
    rows.forEach(cfg => {
        const row = document.createElement('div');
        row.className = 'pl-row pl-summary ' + cfg.cls;
        const lab = document.createElement('div');
        lab.className = 'pl-resource summary-label';
        lab.textContent = cfg.label;
        row.appendChild(lab);
        const track = document.createElement('div');
        track.className = 'pl-track';
        track.style.width = gridWidth + 'px';
        columns.forEach((c, i) => {
            const cell = document.createElement('div');
            cell.className = 'summary-value';
            cell.style.width = c.width + 'px';
            cell.textContent = String(cfg.val(i));
            track.appendChild(cell);
        });
        row.appendChild(track);
        inner.appendChild(row);
    });
}

function renderNowLine(inner) {
    const today = new Date();
    if (today < rangeStart || today > rangeEnd) return;
    const line = document.createElement('div');
    line.className = 'pl-nowline';
    line.style.left = (STICKY_W + xForDate(today)) + 'px';
    inner.appendChild(line);
}

// ── Full build ─────────────────────────────────────────────────
function buildAll() {
    const inner = document.getElementById('planner-inner');
    if (!inner) return;
    loadTimeAxis();
    indexData();
    buildColumns();
    inner.innerHTML = '';

    const resources = safeGet(appfarm.data.resources);
    const searchEl = document.getElementById('search-input');
    const q = (searchEl instanceof HTMLInputElement ? searchEl.value : '').toLowerCase().trim();
    const filtered = resources.filter(res => {
        if (!q) return true;
        return (res.fullNameFx || '').toLowerCase().includes(q)
            || resolveWorkTypeName(res.workType).toLowerCase().includes(q)
            || (res.position || '').toLowerCase().includes(q);
    });

    buildHeader(inner);

    const frag = document.createDocumentFragment();
    const sortByProjects = appfarm.data.sortByProjects?.get() ?? false;

    if (sortByProjects) {
        const anchor = getAnchorDate();
        const groups = {}, unassigned = [], absences = [];
        filtered.forEach(res => {
            const a = allocCoveringDate(res._id, anchor);
            const proj = a ? projectsById.get(resolveId(a.project)) : null;
            if (!proj) return unassigned.push(res);
            if (!groups[proj._id]) groups[proj._id] = [];
            groups[proj._id].push(res);
        });

        Object.entries(groups).forEach(([projId, list]) => {
            const proj = projectsById.get(projId);
            const color = getBadgeColor(proj || {});
            const pmId = resolveId(proj?.projectManager);
            const smId = resolveId(proj?.siteManager);
            const rank = r => r._id === pmId ? 0 : r._id === smId ? 1 : 2;
            list.sort((a, b) => rank(a) - rank(b));
            frag.appendChild(groupHeader(proj?.bepmnX || proj?.name || 'Prosjekt', color));
            frag.appendChild(groupSep(color));
            list.forEach(res => {
                let role = null;
                if (res._id === pmId) role = { label: 'Prosjektleder', rowClass: 'role-pm', tagClass: 'role-tag-pm' };
                else if (res._id === smId) role = { label: 'Anleggsleder', rowClass: 'role-sm', tagClass: 'role-tag-sm' };
                renderRow(res, frag, role);
            });
        });
        if (unassigned.length) {
            frag.appendChild(groupHeader('Ledig / Ikke tildelt prosjekt', '#94a3b8'));
            frag.appendChild(groupSep('#94a3b8'));
            unassigned.forEach(res => renderRow(res, frag));
        }
        if (absences.length) {
            frag.appendChild(groupHeader('Fravær / Permisjon', '#dc8a8a'));
            frag.appendChild(groupSep('#dc8a8a'));
            absences.forEach(res => renderRow(res, frag));
        }
    } else {
        filtered.forEach(res => renderRow(res, frag));
    }

    inner.appendChild(frag);
    buildSummary(inner, filtered);
    renderNowLine(inner);
}

// ── Interaction (pointer-based: create / move / resize) ────────
function setTooltip(n) {
    if (!dragTooltipEl) {
        dragTooltipEl = document.createElement('div');
        dragTooltipEl.className = 'drag-range-tooltip';
        document.body.appendChild(dragTooltipEl);
    }
    const unit = granularity === 'day' ? 'dag' : 'uke';
    dragTooltipEl.textContent = `${n} ${unit}${n === 1 ? '' : (granularity === 'day' ? 'er' : 'r')} oppdateres`;
    dragTooltipEl.style.display = 'block';
}
function moveTooltip(x, y) { if (dragTooltipEl) { dragTooltipEl.style.left = (x+14)+'px'; dragTooltipEl.style.top = (y+14)+'px'; } }
function hideTooltip() { if (dragTooltipEl) dragTooltipEl.style.display = 'none'; }

function onPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.resource-edit-wrapper')) return;
    if (e.target.closest('.pl-jobad')) return;   // job ghost is a link, not a draggable bar
    const track = e.target.closest('.pl-track');
    if (!track || !track.dataset.resourceId) return;

    const resourceId = track.dataset.resourceId;
    const trackRect = track.getBoundingClientRect();
    const bar = e.target.closest('.pl-bar');
    if (bar) {
        const kind = bar.dataset.kind || 'alloc';
        const id = kind === 'absence' ? bar.dataset.absenceId : bar.dataset.allocationId;
        const rec = (kind === 'absence' ? absenceById : allocById).get(id);
        if (!rec) return;

        const LOCK_CLIPPED_BARS = false;
        const isClipped = bar.classList.contains('pl-clip-l') || bar.classList.contains('pl-clip-r');
        const onHandle = !!e.target.closest('.pl-handle');
        if (LOCK_CLIPPED_BARS && isClipped && !onHandle) return;

        const handle = e.target.closest('.pl-handle');
        const mode = handle ? (handle.dataset.edge === 'l' ? 'resize-l' : 'resize-r') : 'move';
        activeDrag = {
            mode, kind, bar, recId: id, resourceId,
            origFrom: startOfDay(new Date(rec.dateFrom)),
            origTo:   endOfDay(new Date(rec.dateTo)),
            startClientX: e.clientX, moved: false,
            origZ: bar.style.zIndex
        };
        bar.style.zIndex = '4';
    } else {
        const downIdx = colIndexFromClientX(e.clientX, trackRect);
        const ghost = document.createElement('div');
        ghost.className = 'pl-bar pl-bar-ghost';
        ghost.style.left = (downIdx * COLW[granularity]) + 'px';
        ghost.style.width = COLW[granularity] + 'px';
        track.appendChild(ghost);
        activeDrag = { mode: 'create', bar: ghost, resourceId, origS: downIdx, origE: downIdx, startClientX: e.clientX, moved: false, track, trackRect };
    }
    document.getElementById('planner-inner')?.classList.add('pl-dragging');
    e.preventDefault();
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
}

function onPointerMove(e) {
    if (!activeDrag) return;
    const W = COLW[granularity];
    if (Math.abs(e.clientX - activeDrag.startClientX) > 4) activeDrag.moved = true;

    if (activeDrag.mode === 'create') {
        const curIdx = colIndexFromClientX(e.clientX, activeDrag.trackRect);
        const s = Math.min(activeDrag.origS, curIdx);
        const eIdx = Math.max(activeDrag.origS, curIdx);
        activeDrag.curS = s; activeDrag.curE = eIdx;
        activeDrag.bar.style.left = (s * W) + 'px';
        activeDrag.bar.style.width = ((eIdx - s + 1) * W) + 'px';
        setTooltip(eIdx - s + 1);
        moveTooltip(e.clientX, e.clientY);
        return;
    }

    const stepDays = granularity === 'day' ? 1 : 7;
    const deltaDays = Math.round((e.clientX - activeDrag.startClientX) / W) * stepDays;
    let from = activeDrag.origFrom, to = activeDrag.origTo;

    if (activeDrag.mode === 'move') {
        from = addDays(from, deltaDays);
        to   = addDays(to,   deltaDays);
    } else if (activeDrag.mode === 'resize-r') {
        to = addDays(to, deltaDays);
        if (+to < +from) to = endOfDay(from);
    } else if (activeDrag.mode === 'resize-l') {
        from = addDays(from, deltaDays);
        if (+from > +to) from = startOfDay(to);
    }

    activeDrag.curFrom = from; activeDrag.curTo = to;
    const left = xForDate(from), right = xForDate(to);
    activeDrag.bar.style.left = left + 'px';
    activeDrag.bar.style.width = Math.max(right - left, 8) + 'px';

    const spanDays = Math.round((+startOfDay(to) - +startOfDay(from)) / DAY_MS) + 1;
    setTooltip(granularity === 'day' ? spanDays : Math.max(1, Math.ceil(spanDays / 7)));
    moveTooltip(e.clientX, e.clientY);
}

function onPointerUp(e) {
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    document.getElementById('planner-inner')?.classList.remove('pl-dragging');
    hideTooltip();
    const d = activeDrag;
    activeDrag = null;
    if (!d) return;

    if (d.mode !== 'create' && d.bar) d.bar.style.zIndex = d.origZ || '';

    const popoverX = Math.round(e.clientX), popoverY = Math.round(e.clientY);

    if (d.mode === 'create') {
        d.bar.remove();
        const s = clampIdx(d.curS ?? d.origS), eIdx = clampIdx(d.curE ?? d.origE);
        const dateFrom = columns[s].start.toISOString();
        const dateTo   = columns[eIdx].end.toISOString();
        appfarm.actions?.openAllocationAbsenceEditor?.(
            { resourceId: d.resourceId, allocationId: null, projectId: null, dateFrom, dateTo, popoverX, popoverY },
            { event: e });
        return;
    }

    if (!d.moved) {
        if (d.kind === 'absence') {
            const rec = absenceById.get(d.recId);
            appfarm.actions?.openAllocationAbsenceEditor?.(
                { resourceId: d.resourceId, absenceId: d.recId,
                  dateFrom: rec?.dateFrom, dateTo: rec?.dateTo, popoverX, popoverY }, { event: e });
        } else {
            const rec = allocById.get(d.recId);
            appfarm.actions?.openAllocationAbsenceEditor?.(
                { resourceId: d.resourceId, allocationId: d.recId, projectId: resolveId(rec?.project),
                  dateFrom: rec?.dateFrom, dateTo: rec?.dateTo, popoverX, popoverY }, { event: e });
        }
        return;
    }

    let from = d.curFrom ?? d.origFrom;
    let to   = d.curTo   ?? d.origTo;

    if (granularity === 'week') { from = startOfWeekMon(from); to = endOfWeekMon(to); }

    if (+to < +from) to = endOfDay(from);

    const dateFrom = from.toISOString();
    const dateTo   = to.toISOString();

    if (d.kind === 'absence') appfarm.actions?.saveAbsenceDates?.({ absenceId: d.recId, dateFrom, dateTo });
    else appfarm.actions?.saveAllocationDates?.({ allocationId: d.recId, dateFrom, dateTo });
}

function onClick(e) {
    const editWrap = e.target.closest('.resource-edit-wrapper');
    if (editWrap) {
        const rid = editWrap.closest('.pl-resource')?.dataset.resourceId;
        if (rid) appfarm.actions?.openResourceEdit?.({ resourceId: rid });
        return;
    }
    const ghost = e.target.closest('.pl-jobad');
    if (ghost) appfarm.actions?.openJob?.({ jobId: ghost.dataset.jobId });
}

// ── Lifecycle ──────────────────────────────────────────────────
function ensureSkeleton() {
    const root = document.getElementById('planner');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
        <div class="pl-controls">
            <input id="search-input" class="pl-search" placeholder="Søk ressurs / fag / rolle" />
            <div class="pl-gran" id="granularity-toggle">
                <button data-granularity="week" class="active">Uker</button>
                <button data-granularity="day">Dager</button>
            </div>
        </div>
        <div id="planner-scroll" class="pl-scroll"><div id="planner-inner" class="pl-inner"></div></div>`;
}

let initialized = false;
function init() {
    if (initialized) return;
    initialized = true;
    ensureSkeleton();

    applyGranularity(appfarm.data.viewGranularity?.get?.());

    const inner = document.getElementById('planner-inner');
    inner?.addEventListener('mousedown', onPointerDown);
    inner?.addEventListener('click', onClick);

    let deb;
    document.getElementById('search-input')?.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(buildAll, 150); });

    document.getElementById('granularity-toggle')?.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const btn = target.closest('button[data-granularity]');
        if (!btn) return;
        applyGranularity(btn.getAttribute('data-granularity'), { write: true });
    });

    appfarm.data.viewGranularity?.on?.('change', () => {
        const v = appfarm.data.viewGranularity.get();
        if (v === granularity) return;
        applyGranularity(v);
    });

    appfarm.data.sortByProjects?.on?.('change', buildAll);
    ['viewStart', 'viewEnd', 'resources', 'projects', 'allocation', 'absence', 'workTypeEnum', 'absenceColors', 'jobs']
        .forEach(h => appfarm.data[h]?.on?.('change', buildAll));
}

if (document.readyState === 'complete' || document.readyState === 'interactive') init();
else document.addEventListener('DOMContentLoaded', init);
