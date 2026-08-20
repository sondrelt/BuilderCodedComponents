// --- Project Team Grid — per-project, resource-centric team timeline (day / week) ---
//
//  Data source:  project { _id, ... }  (single bound record — one instance per project page)
//  Also read:     resources { _id, fullNameFx, workType, position }, projects { _id, name, bepmnX, colorHexCode },
//                 allocation { project, workType, resource, dateFrom, dateTo },
//                 absence { resource, dateFrom, dateTo, absenceType },
//                 workTypeEnum, absenceColors, tradeSkills { _id, name, description },
//                 projectResourceRequests { project, workType, resourceCount, comment, dateFrom, dateTo },
//                 projectResourceRequestTradeSkills { projectResourceRequest, tradeSkill }  — many-to-many
//                   junction (both fields plain id strings, not expanded by Appfarm — same
//                   non-expansion pattern as assignment-grid's resourceTradeSkills), joined
//                   client-side via resolveId() same as every other ref in this file. This
//                   component only READS the junction, same as assignment-grid does for
//                   resourceTradeSkills — the write side (createProjectResourceRequest /
//                   updateProjectResourceRequest) still just takes a plain tradeSkillIds
//                   array; Appfarm's action is responsible for materializing/diffing the
//                   junction rows from that array.
//
//  This is a fork of `assignment-grid` (span-native timeline, drag state machine, popover/
//  calendar widgets) scoped to ONE project's team instead of the whole company. Team
//  membership is derived client-side from `allocation` (not a pre-filtered `resources`
//  input) — see deriveTeamResourceIds(). Unlike assignment-grid, this view never lets a PM
//  directly assign a resource to the project (that stays the resource planner's job there):
//  allocation bars are read-only display only. The two write gestures here are:
//    • drag an empty lane on a resource's row  → report an absence
//    • drag an empty lane on the "Ressursbehov" row → ask for more resources
//        (work type + trade skills + count + a comment for HR staffing)
//
//  Appfarm actions called (all via optional chaining — a missing action is a silent
//  no-op instead of a thrown TypeError):
//    allocationAbsenceSave { resourceId, abscenceType, dateFrom, dateTo }  — CREATE absence only
//    saveAbsenceDates { absenceId, dateFrom, dateTo, abscenceType }        — move/resize
//    deleteAbsence { resourceAbsenceId }
//    createProjectResourceRequest { projectId, workType, tradeSkillIds, count, comment, dateFrom, dateTo }
//    updateProjectResourceRequest { projectResourceRequestId, dateFrom, dateTo, count, tradeSkillIds, comment }
//    deleteProjectResourceRequest { projectResourceRequestId }
//
//  NOTE: `projectResourceRequest` is a NEW object class, separate from resource-req-v2's
//  aggregate `projectRequirements`/"Behov" — this one carries a many-to-many trade-skill
//  link (via projectResourceRequestTradeSkill) + a comment and represents ad-hoc
//  PM→HR-staffing communication, not coverage math.
//
//  Cross-component change propagation: functions ported from assignment-grid keep the SAME
//  name here (never renamed to fit local style) and are tagged at their definition with
//  "Ported from assignment-grid/index.js:<line> (<fn>) — verbatim." or "— adapted: <what
//  changed>." so a future assignment-grid bugfix can be traced here via
//  `grep -rn "<fnName>" components/`.

// NOTE: Do NOT add a 'use strict' directive here. Appfarm wraps coded-component
// scripts in a generated function with a non-simple parameter list, and a
// directive prologue is a syntax error in that context.

// ── Module state ───────────────────────────────────────────────
let granularity = 'week';            // 'week' | 'day'
let columns = [];                    // [{ index, start, end, width, left, topLabel, topYear, label }]
let gridWidth = 0;
let rangeStart = null, rangeEnd = null;

let weeksList = [];
let weekDateRanges = {};
let wtNameMap = {};

let currentProjectId = null;         // set once per buildAll() from appfarm.data.project

let projectsById = new Map();
let resourceById = new Map();
let allocsByResource = new Map();    // resourceId -> [Allocation] (sorted by dateFrom)
let allocById = new Map();

let absencesByResource = new Map();
let absenceById = new Map();

let tradeSkillById = new Map();      // tradeSkill id -> {name, description} — catalog for the multi-select
let skillsByRequest = new Map();     // projectResourceRequest id -> [{_id,name,description}] — joined from
                                      // the projectResourceRequestTradeSkills junction, same pattern as
                                      // assignment-grid's skillsByResource/resourceTradeSkills

let requestsByProject = new Map();   // projectId -> [projectResourceRequest] (sorted by dateFrom)
let requestById = new Map();

let activeDrag = null;               // see onPointerDown for shape
let dragTooltipEl = null;

let touchTap = null;                 // see onTouchPointerDown for shape
const TOUCH_TAP_SLOP = 10;           // px — belt-and-suspenders alongside pointercancel

let popoverEl = null;                // ask/absence editor popover (in document.body)
let activeEdit = false;              // popover open → block rebuilds
let rebuildQueued = false;           // a change arrived while blocked → flush later

let absenceTypeMap = {};             // { value: { name, color } }

// Breakpoint (640px) must match styles.css's "@media (max-width: 640px)" block.
function getStickyW() {
    const w = document.getElementById('team-planner')?.clientWidth || window.innerWidth;
    return w <= 640 ? 140 : 380;
}
const COLW = { week: 75, day: 75 };
const ROW_H = 34;

// ── Appfarm action + parameter names ───────────────────────────
// This view never creates/edits allocations (Tildeling is out of scope — direct
// assignment stays in assignment-grid), so `allocationAbsenceSave` is only ever
// called with absence params here. Same misspelling caveat as assignment-grid:
// the Appfarm action param is MISSPELLED `abscenceType` (extra c). Send the
// misspelled key; keep record.absenceType (the data-model field) correctly spelled.
const ACT = {
    save:             'allocationAbsenceSave',  // ({ resourceId, abscenceType, dateFrom, dateTo }) — CREATE only
    saveAbsenceDates: 'saveAbsenceDates',       // ({ absenceId, dateFrom, dateTo, abscenceType }) — move/resize
    deleteAbsence:    'deleteAbsence',          // ({ resourceAbsenceId })
    absenceIdParam:   'resourceAbsenceId'
};

const MONTHS_NB = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

// Period-picker calendar labels / range (ported from assignment-grid, itself from resource-req-v2)
const WEEKDAY_LABELS = ['Ma','Ti','On','To','Fr','Lø','Sø'];
const MONTH_NAMES = ['januar','februar','mars','april','mai','juni',
    'juli','august','september','oktober','november','desember'];
const CAL_YEAR_BACK = 2;
const CAL_YEAR_FWD  = 6;

const RESOURCE_CELL_MARKUP = `
    <div class="resource-info">
        <div class="resource-name"></div>
        <div class="resource-position"></div>
    </div>`;
let resourceCellTemplate = null;

// ── Utilities ──────────────────────────────────────────────────
// Ported from assignment-grid/index.js:101-104 — verbatim.
const safeGet = (ds) => ds?.get?.() || [];
const resolveId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);
const clampIdx = (i) => Math.max(0, Math.min(columns.length - 1, i));
const DAY_MS = 86400000;

// Ported from assignment-grid/index.js:124-132 — verbatim.
function getContrastColor(hex) {
    if (!hex) return '#1e293b';
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1e293b' : '#ffffff';
}
function getBadgeColor(proj) { return proj?.colorHexCode || '#d1eae0'; }

// Ported from assignment-grid/index.js:134-144 — verbatim.
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
// Ported from assignment-grid/index.js:147-154 — verbatim.
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeekMon(d){ const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
function endOfWeekMon(d){ const x = startOfWeekMon(d); x.setDate(x.getDate()+6); return endOfDay(x); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtDayMonth(d){ const x = new Date(d); return String(x.getDate()).padStart(2,'0') + '.' + String(x.getMonth()+1).padStart(2,'0'); }
function fmtDate(d){ return fmtDayMonth(d) + '.' + new Date(d).getFullYear(); }

// ── Week / day view-granularity helpers ────────────────────────
// Ported from assignment-grid/index.js:157-167 — verbatim.
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
// Ported from assignment-grid/index.js:170-175 — verbatim.
function buildWorkTypeNameMap(data) {
    const map = {};
    (data || []).forEach(i => { if (i?.enum_value != null) map[i.enum_value] = i.enum_name || String(i.enum_value); });
    return map;
}
function resolveWorkTypeName(v) { return (!v && v !== 0) ? '' : (wtNameMap?.[v] ?? String(v)); }

// ── Time axis: window comes from viewFrom/viewTo, columns regenerated per granularity ──
// Ported from assignment-grid/index.js:178-248 — verbatim.
function loadTimeAxis() {
    const vs = appfarm.data.viewFrom?.get?.();
    const ve = appfarm.data.viewTo?.get?.();

    rangeStart = startOfWeekMon(vs ? new Date(vs) : new Date());
    rangeEnd   = endOfWeekMon(ve ? new Date(ve) : addDays(rangeStart, 7 * 12));

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
        const today = startOfDay(new Date());
        const currentWeekIdx = weeksList.findIndex(w =>
            +today >= +new Date(w.timestamp) && +today <= +new Date(w.periodEnd)
        );
        const anchorIdx = currentWeekIdx >= 0 ? currentWeekIdx : weeksList.length - 1;

        const periodStart = startOfDay(new Date(
            appfarm.data.viewFrom?.get?.() ?? rangeStart
        ));
        let cur = startOfDay(addDays(today, -anchorIdx));
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
// Ported from assignment-grid/index.js:251-272 — verbatim.
function colIndexForDate(d) {
    const t = +d;
    let lo = 0, hi = columns.length - 1;
    while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (t < +columns[m].start) hi = m - 1;
        else if (t > +columns[m].end) lo = m + 1;
        else return m;
    }
    return t < +columns[0]?.start ? -1 : columns.length;
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
// Adapted from assignment-grid/index.js:275-337 — same allocation/absence indexing
// verbatim; dropped jobsByWorkType/iconByWorkType (out of scope, see CHANGELOG); added
// tradeSkillById (catalog), requestsByProject, and skillsByRequest (the
// projectResourceRequestTradeSkills join — same shape/pattern as assignment-grid's
// skillsByResource/resourceTradeSkills join, resolveId() on both ref fields since
// Appfarm may hand either a plain id string or an expanded object).
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
    resourceById = new Map(safeGet(appfarm.data.resources).map(r => [r._id, r]));

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

    tradeSkillById = new Map(safeGet(appfarm.data.tradeSkills).map(s => [s._id, s]));

    skillsByRequest = new Map();
    safeGet(appfarm.data.projectResourceRequestTradeSkills).forEach(rec => {
        const reqId = resolveId(rec.projectResourceRequest);
        if (!reqId) return;
        const skill = tradeSkillById.get(resolveId(rec.tradeSkill));
        if (!skill) return;
        if (!skillsByRequest.has(reqId)) skillsByRequest.set(reqId, []);
        skillsByRequest.get(reqId).push(skill);
    });

    requestsByProject = new Map();
    requestById = new Map();
    safeGet(appfarm.data.projectResourceRequests).forEach(r => {
        requestById.set(r._id, r);
        const pid = resolveId(r.project);
        if (!pid) return;
        if (!requestsByProject.has(pid)) requestsByProject.set(pid, []);
        requestsByProject.get(pid).push(r);
    });
    requestsByProject.forEach(list => list.sort((x, y) => +new Date(x.dateFrom) - +new Date(y.dateFrom)));
}

// New: team membership is derived from who has an allocation to THIS project
// overlapping the visible range — not from a pre-filtered `resources` input. This
// is also what makes the grayed-out other-project bars possible: the full
// allocation table is already in memory either way.
function deriveTeamResourceIds(projectId) {
    const ids = new Set();
    allocsByResource.forEach((list, rid) => {
        const onProject = list.some(a =>
            resolveId(a.project) === projectId &&
            +endOfDay(new Date(a.dateTo)) >= +rangeStart &&
            +startOfDay(new Date(a.dateFrom)) <= +rangeEnd);
        if (onProject) ids.add(rid);
    });
    return ids;
}

// ── Resource info cell ─────────────────────────────────────────
// Adapted from assignment-grid/index.js:374-425 (buildResourceCell) — role tags,
// skill chips, work-type icon and the edit-pencil wrapper all dropped (out of
// scope here; direct resource editing/role tags stay in assignment-grid).
function getResourceCellTemplate() {
    if (!resourceCellTemplate) {
        resourceCellTemplate = document.createElement('div');
        resourceCellTemplate.className = 'ptg-resource';
        resourceCellTemplate.innerHTML = RESOURCE_CELL_MARKUP;
    }
    return resourceCellTemplate;
}
function buildResourceCell(res) {
    const cell = getResourceCellTemplate().cloneNode(true);
    cell.dataset.resourceId = res._id;
    const nameEl = cell.querySelector('.resource-name');
    const posEl  = cell.querySelector('.resource-position');
    nameEl.textContent = res.fullNameFx || '';  nameEl.title = res.fullNameFx || '';
    posEl.textContent = res.position || '';     posEl.title = res.position || '';
    return cell;
}

// ── Bar (one per Allocation / Absence) ─────────────────────────
// Adapted from assignment-grid/index.js:428-475 (makeBar) — the editable
// this-project `alloc` kind from assignment-grid is gone (allocations are never
// created/edited here); this makeBar renders THREE read-mostly kinds instead:
//   'alloc'       — this project's allocation, normal colour, read-only display
//   'other-alloc' — a DIFFERENT project's allocation, grayed out, read-only,
//                   answers "why is this person only half-available"
//   'absence'     — interactive: draggable/resizable/deletable, same as before
function makeBar(record, kind) {
    const isAbsence = kind === 'absence';
    const proj = isAbsence ? null : projectsById.get(resolveId(record.project));
    const at = isAbsence ? record.absenceType : null;
    const dynamicAbsence = isAbsence ? absenceTypeMap[at] : null;

    const color = isAbsence ? (dynamicAbsence?.color || '#e5e7eb') : getBadgeColor(proj || {});
    const label = isAbsence ? (dynamicAbsence?.name || 'Fravær')
                            : (proj ? (proj.bepmnX || proj.name || 'Prosjekt') : 'Prosjekt');

    const recFrom = startOfDay(new Date(record.dateFrom));
    const recTo   = endOfDay(new Date(record.dateTo));
    const left  = xForDate(recFrom);
    const right = xForDate(recTo);
    const clipL = +recFrom < +rangeStart;
    const clipR = +recTo   > +rangeEnd;

    const interactive = isAbsence; // alloc/other-alloc are read-only display in this view

    const bar = document.createElement('div');
    bar.className = 'ptg-bar'
        + (isAbsence ? ' ptg-bar-absence' : '')
        + (!interactive ? ' ptg-bar-readonly' : '')
        + (kind === 'other-alloc' ? ' ptg-bar-other-project' : '')
        + (clipL ? ' ptg-clip-l' : '') + (clipR ? ' ptg-clip-r' : '');
    bar.style.left = left + 'px';
    bar.style.width = Math.max(right - left, 1) + 'px';
    bar.style.backgroundColor = color;
    bar.style.color = getContrastColor(color);
    bar.dataset.kind = kind;
    if (isAbsence) bar.dataset.absenceId = record._id;
    bar.title = kind === 'other-alloc' ? `${label} (annet prosjekt)` : label;
    bar.innerHTML =
        (interactive && !clipL ? `<span class="ptg-handle" data-edge="l"></span>` : '') +
        `<span class="ptg-bar-label"></span>` +
        (interactive && !clipR ? `<span class="ptg-handle" data-edge="r"></span>` : '');
    bar.querySelector('.ptg-bar-label').textContent = label;
    return bar;
}

// New: bar for a projectResourceRequest on the "Ressursbehov" row. Interactive
// (create/move/resize/delete), dashed outline to read as "an ask", not a
// committed assignment.
function makeRequestBar(record) {
    const wtLabel = resolveWorkTypeName(record.workType) || 'Ukjent fag';
    const count = Number(record.resourceCount) || 0;
    const skills = skillsByRequest.get(record._id) || [];
    const label = `${wtLabel} × ${count}`;

    const recFrom = startOfDay(new Date(record.dateFrom));
    const recTo   = endOfDay(new Date(record.dateTo));
    const left  = xForDate(recFrom);
    const right = xForDate(recTo);
    const clipL = +recFrom < +rangeStart;
    const clipR = +recTo   > +rangeEnd;

    const bar = document.createElement('div');
    bar.className = 'ptg-bar ptg-bar-request'
        + (clipL ? ' ptg-clip-l' : '') + (clipR ? ' ptg-clip-r' : '');
    bar.style.left = left + 'px';
    bar.style.width = Math.max(right - left, 1) + 'px';
    bar.dataset.kind = 'request';
    bar.dataset.requestId = record._id;

    const titleLines = [label];
    if (skills.length) titleLines.push('Fag: ' + skills.map(s => s.name).join(', '));
    if (record.comment) titleLines.push('Kommentar: ' + record.comment);
    bar.title = titleLines.join('\n');

    bar.innerHTML =
        (clipL ? '' : `<span class="ptg-handle" data-edge="l"></span>`) +
        `<span class="ptg-bar-label"></span>` +
        (clipR ? '' : `<span class="ptg-handle" data-edge="r"></span>`);
    bar.querySelector('.ptg-bar-label').textContent = label;
    return bar;
}

// Adapted from assignment-grid/index.js:524-555 (makeTrack) — job-ad ghost overlay
// dropped (out of scope); allocation bars now branch this-project vs other-project.
function makeTrack(res, projectId) {
    const resourceId = res._id;
    const track = document.createElement('div');
    track.className = 'ptg-track';
    track.dataset.resourceId = resourceId;
    track.dataset.rowKind = 'resource';
    track.style.width = gridWidth + 'px';
    const W = COLW[granularity];
    track.style.backgroundSize = `${W}px 100%`;
    (allocsByResource.get(resourceId) || []).forEach(a => {
        const kind = resolveId(a.project) === projectId ? 'alloc' : 'other-alloc';
        track.appendChild(makeBar(a, kind));
    });
    (absencesByResource.get(resourceId) || []).forEach(a => track.appendChild(makeBar(a, 'absence')));
    return track;
}

// Ported from assignment-grid/index.js:557-566 (renderRow) — adapted: no role/color
// params (grouping/role tags dropped), passes projectId through to makeTrack.
function renderRow(res, frag, projectId) {
    const row = document.createElement('div');
    row.className = 'ptg-row';
    row.appendChild(buildResourceCell(res));
    row.appendChild(makeTrack(res, projectId));
    frag.appendChild(row);
}

// New: the synthetic "Ressursbehov" (need resources) row — a single flat row (not
// one-per-work-type like resource-req-v2's Behov lanes; this view is resource-first,
// not work-type-first, so a second grouping axis isn't warranted at this volume).
// Pinned first, above the real team rows, closed off by a full-width separator.
function renderNeedsRow(frag, projectId) {
    const row = document.createElement('div');
    row.className = 'ptg-row ptg-row-request';

    const label = document.createElement('div');
    label.className = 'ptg-resource ptg-needs-label';
    label.textContent = 'Ressursbehov';
    label.title = 'Dra for å be om flere ressurser';
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'ptg-track';
    track.dataset.rowKind = 'request';
    track.style.width = gridWidth + 'px';
    const W = COLW[granularity];
    track.style.backgroundSize = `${W}px 100%`;
    (requestsByProject.get(projectId) || []).forEach(r => track.appendChild(makeRequestBar(r)));
    row.appendChild(track);

    frag.appendChild(row);

    const sep = document.createElement('div');
    sep.className = 'ptg-needs-sep';
    sep.style.width = (getStickyW() + gridWidth) + 'px';
    frag.appendChild(sep);
}

// ── Header (month groups + column labels) ──────────────────────
// Ported from assignment-grid/index.js:601-647 (buildHeader) — verbatim, pl- → ptg-.
function buildHeader(inner) {
    const today = new Date();
    const header = document.createElement('div');
    header.className = 'ptg-header';

    const corner = document.createElement('div');
    corner.className = 'ptg-corner';
    header.appendChild(corner);

    const axis = document.createElement('div');
    axis.className = 'ptg-axis';
    axis.style.width = gridWidth + 'px';

    const months = document.createElement('div');
    months.className = 'ptg-months';
    let g = null;
    columns.forEach(c => {
        if (!g || g.topLabel !== c.topLabel || g.topYear !== c.topYear) {
            const cell = document.createElement('div');
            cell.className = 'ptg-month';
            cell.textContent = `${c.topLabel} '${String(c.topYear).slice(-2)}`;
            g = { topLabel: c.topLabel, topYear: c.topYear, n: 0, el: cell };
            months.appendChild(cell);
        }
        g.n++;
        g.el.style.width = (g.n * COLW[granularity]) + 'px';
    });

    const colRow = document.createElement('div');
    colRow.className = 'ptg-cols';
    columns.forEach(c => {
        const cell = document.createElement('div');
        cell.className = 'ptg-col';
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

// Adapted from assignment-grid/index.js:696-710 (renderNowLine) — no summary rows
// or group headers here, so the span is simply first row → last row.
function renderNowLine(inner) {
    const today = new Date();
    if (today < rangeStart || today > rangeEnd) return;
    const rows = inner.querySelectorAll('.ptg-row');
    const firstRow = rows[0];
    const lastRow = rows[rows.length - 1];
    if (!firstRow || !lastRow) return;
    const top = firstRow.offsetTop - 2;
    const line = document.createElement('div');
    line.className = 'ptg-nowline';
    line.style.left   = (getStickyW() + xForDate(today)) + 'px';
    line.style.top    = top + 'px';
    line.style.height = (lastRow.offsetTop + lastRow.offsetHeight - top) + 'px';
    inner.appendChild(line);
}

// ── Full build ─────────────────────────────────────────────────
// Adapted from assignment-grid/index.js:713-788 (buildAll) — sortByProjects
// grouping/summary rows dropped; rows are always this project's team, flat,
// with the needs row pinned first.
function buildAll() {
    const inner = document.getElementById('planner-inner');
    if (!inner) return;
    loadTimeAxis();
    indexData();
    buildColumns();
    inner.innerHTML = '';

    const project = appfarm.data.project?.get?.();
    currentProjectId = project?._id || null;
    if (!currentProjectId) {
        buildHeader(inner);
        return; // nothing bound yet
    }

    let team = [...deriveTeamResourceIds(currentProjectId)]
        .map(id => resourceById.get(id))
        .filter(Boolean);

    const searchEl = document.getElementById('search-input');
    const q = (searchEl instanceof HTMLInputElement ? searchEl.value : '').toLowerCase().trim();
    if (q) {
        team = team.filter(res =>
            (res.fullNameFx || '').toLowerCase().includes(q)
            || resolveWorkTypeName(res.workType).toLowerCase().includes(q)
            || (res.position || '').toLowerCase().includes(q));
    }
    team.sort((a, b) => (a.fullNameFx || '').localeCompare(b.fullNameFx || ''));

    buildHeader(inner);

    const frag = document.createDocumentFragment();
    renderNeedsRow(frag, currentProjectId);
    team.forEach(res => renderRow(res, frag, currentProjectId));
    inner.appendChild(frag);

    renderNowLine(inner);
}

// ── Rebuild guard ──────────────────────────────────────────────
// Ported from assignment-grid/index.js:889-903 — verbatim.
function guardedBuildAll() {
    if (activeEdit || activeDrag) { rebuildQueued = true; return; }
    buildAll();
}
function flushQueuedRebuild() {
    if (rebuildQueued && !activeEdit && !activeDrag) {
        rebuildQueued = false;
        buildAll();
    }
}
function removePopover() {
    if (popoverEl) { popoverEl.remove(); popoverEl = null; }
    activeEdit = false;
    flushQueuedRebuild();
}

// ── Searchable flat list (single-pick) ───────────────────────────────────────
// Ported from assignment-grid/index.js:909-963 (makeFlatList) — verbatim, pl- → ptg-.
// opts: { items:[{id,label,color?}], value, placeholder, onPick(id) }
function makeFlatList(mount, opts) {
    let value = opts.value ?? null;
    let query = '';
    mount.innerHTML = '';
    mount.classList.remove('ptg-pop-invalid');

    const input = /** @type {HTMLInputElement} */ (document.createElement('input'));
    input.className = 'ptg-select-input';
    input.placeholder = opts.placeholder || 'Søk…';
    const list = document.createElement('div');
    list.className = 'ptg-list';
    mount.appendChild(input);
    mount.appendChild(list);

    let firstId = null;
    function renderList() {
        const q = query.toLowerCase().trim();
        const matches = opts.items.filter(it => !q || it.label.toLowerCase().includes(q));
        firstId = matches[0]?.id ?? null;
        list.innerHTML = '';
        if (!matches.length) {
            const e = document.createElement('div');
            e.className = 'ptg-select-empty';
            e.textContent = 'Ingen treff';
            list.appendChild(e);
            return;
        }
        matches.forEach((it) => {
            const row = document.createElement('div');
            row.className = 'ptg-list-opt' + (String(it.id) === String(value) ? ' sel' : '');
            const sw = document.createElement('span');
            sw.className = 'ptg-list-dot';
            sw.style.background = it.color || '#d1d5db';
            row.appendChild(sw);
            const t = document.createElement('span');
            t.className = 'ptg-select-opt-label';
            t.textContent = it.label;
            row.appendChild(t);
            row.addEventListener('click', () => pick(it.id));
            list.appendChild(row);
        });
    }
    function pick(id) {
        value = id;
        mount.classList.remove('ptg-pop-invalid');
        renderList();
        opts.onPick?.(id);
    }
    input.addEventListener('input', () => { query = input.value; renderList(); });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (firstId != null) pick(firstId); }
    });

    renderList();
}

// ── Searchable multi-select (checkbox list) ──────────────────────────────────
// Adapted from makeFlatList's shell above (assignment-grid/index.js:909) — NOT a
// verbatim port, the selection model differs (multi-pick checkboxes vs single-pick
// replace). Used for trade-skill selection on the "ask for more resources" popover.
// opts: { items:[{id,label,color?}], values:Iterable<id>, placeholder, onChange(idsArray) }
function makeMultiSelect(mount, opts) {
    let query = '';
    const values = new Set(opts.values || []);
    mount.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'ptg-multiselect-summary';
    const input = document.createElement('input');
    input.className = 'ptg-select-input';
    input.placeholder = opts.placeholder || 'Søk…';
    const list = document.createElement('div');
    list.className = 'ptg-list';
    mount.appendChild(summary);
    mount.appendChild(input);
    mount.appendChild(list);

    function updateSummary() {
        summary.textContent = values.size ? `${values.size} valgt` : 'Ingen valgt';
    }
    function renderList() {
        const q = query.toLowerCase().trim();
        const matches = opts.items.filter(it => !q || it.label.toLowerCase().includes(q));
        list.innerHTML = '';
        if (!matches.length) {
            const e = document.createElement('div');
            e.className = 'ptg-select-empty';
            e.textContent = 'Ingen treff';
            list.appendChild(e);
            return;
        }
        matches.forEach((it) => {
            const row = document.createElement('label');
            row.className = 'ptg-multiselect-opt';
            const cb = /** @type {HTMLInputElement} */ (document.createElement('input'));
            cb.type = 'checkbox';
            cb.checked = values.has(it.id);
            cb.addEventListener('change', () => {
                if (cb.checked) values.add(it.id); else values.delete(it.id);
                updateSummary();
                opts.onChange?.([...values]);
            });
            row.appendChild(cb);
            const sw = document.createElement('span');
            sw.className = 'ptg-list-dot';
            sw.style.background = it.color || '#d1d5db';
            row.appendChild(sw);
            const t = document.createElement('span');
            t.className = 'ptg-select-opt-label';
            t.textContent = it.label;
            row.appendChild(t);
            list.appendChild(row);
        });
    }
    input.addEventListener('input', () => { query = input.value; renderList(); });
    updateSummary();
    renderList();
}

// ── Day picker (exact-day calendar inside the popover) ──────────────────────────
// Ported from assignment-grid/index.js:967-1051 — verbatim, pl- → ptg-.
function applyPick(from, to, end, day) {
    const d = startOfDay(day);
    if (end === 'from') return { from: d, to: (to && +to < +d) ? d : to };
    return { from: (from && +d < +from) ? d : from, to: d };
}

function renderDayPicker(mount, opts) {
    let view = startOfDay(opts.view || opts.selected || new Date());
    let yearOpen = false;

    function setView(d) { view = startOfDay(d); opts.onNavigate?.(view); render(); }

    function render() {
        mount.innerHTML = '';

        const nav = document.createElement('div');
        nav.className = 'ptg-cal-nav';
        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'ptg-cal-title' + (yearOpen ? ' open' : '');
        title.textContent = MONTH_NAMES[view.getMonth()] + ' ' + view.getFullYear();
        title.addEventListener('click', () => { yearOpen = !yearOpen; render(); });
        const arrows = document.createElement('div');
        arrows.className = 'ptg-cal-arrows';
        const prev = document.createElement('button');
        prev.type = 'button'; prev.className = 'ptg-cal-navbtn'; prev.innerHTML = '‹';
        const next = document.createElement('button');
        next.type = 'button'; next.className = 'ptg-cal-navbtn'; next.innerHTML = '›';
        prev.addEventListener('click', () => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1)));
        next.addEventListener('click', () => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1)));
        arrows.appendChild(prev); arrows.appendChild(next);
        nav.appendChild(title); nav.appendChild(arrows);
        mount.appendChild(nav);

        if (yearOpen) {
            renderYearGrid(mount, view.getFullYear(), (y) => {
                yearOpen = false;
                setView(new Date(y, view.getMonth(), 1));
            });
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'ptg-cal-grid';
        const wkHead = document.createElement('div');
        wkHead.className = 'ptg-cal-hcell ptg-cal-weeknum';
        wkHead.textContent = 'U';
        grid.appendChild(wkHead);
        WEEKDAY_LABELS.forEach(l => {
            const h = document.createElement('div');
            h.className = 'ptg-cal-hcell';
            h.textContent = l;
            grid.appendChild(h);
        });

        const sel = opts.selected ? +startOfDay(opts.selected) : null;
        const monthIdx = view.getMonth();
        let cur = startOfWeekMon(new Date(view.getFullYear(), monthIdx, 1));
        for (let i = 0; i < 42; i++) {
            const day = addDays(cur, i);
            if (i % 7 === 0) {
                const wk = document.createElement('div');
                wk.className = 'ptg-cal-cell ptg-cal-weeknum';
                wk.textContent = String(getISOWeek(day));
                grid.appendChild(wk);
            }
            const cell = document.createElement('div');
            cell.className = 'ptg-cal-cell ptg-cal-day';
            if (day.getMonth() !== monthIdx) cell.classList.add('muted');
            if (sel != null && +startOfDay(day) === sel) cell.classList.add('sel');
            cell.textContent = String(day.getDate());
            cell.addEventListener('click', () => opts.onPickDay(day));
            grid.appendChild(cell);
        }
        mount.appendChild(grid);
    }
    render();
}

function renderYearGrid(mount, currentYear, onPick) {
    const seedY = new Date().getFullYear();
    const grid = document.createElement('div');
    grid.className = 'ptg-cal-yeargrid';
    let selEl = null;
    for (let y = seedY - CAL_YEAR_BACK; y <= seedY + CAL_YEAR_FWD; y++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'ptg-cal-year' + (y === currentYear ? ' sel' : '');
        cell.textContent = String(y);
        cell.addEventListener('click', () => onPick(y));
        if (y === currentYear) selEl = cell;
        grid.appendChild(cell);
    }
    mount.appendChild(grid);
    selEl?.scrollIntoView({ block: 'center' });
}

// Icons shared by both popovers below (line-style, stroke, currentColor).
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>';

// Shared Fra/Til date-field + collapsible-calendar wiring, used by both popovers
// below. Returns { updateChips, placePopover } so the caller can hook them into
// its own confirm()/resize flow. mount must already contain the standard
// .ptg-pop-datefields + .ptg-datepop markup (see POPOVER html below).
function wireDateFields(popoverEl, calState, seed, opts, onPlaced) {
    const chipFrom  = popoverEl.querySelector('.ptg-chip-from');
    const chipTo    = popoverEl.querySelector('.ptg-chip-to');
    const fieldFrom = popoverEl.querySelector('.ptg-datefield[data-end="from"]');
    const fieldTo   = popoverEl.querySelector('.ptg-datefield[data-end="to"]');
    const calMount  = popoverEl.querySelector('.ptg-datepop');
    let calOpen = false;

    function updateChips() {
        chipFrom.textContent = calState.from ? fmtDate(calState.from) : '–';
        chipTo.textContent   = calState.to   ? fmtDate(calState.to)   : '–';
        fieldFrom.classList.toggle('active', calOpen && calState.open === 'from');
        fieldTo.classList.toggle('active', calOpen && calState.open === 'to');
    }
    function renderCalendar() {
        const isFrom = calState.open === 'from';
        renderDayPicker(calMount, {
            selected: isFrom ? calState.from : calState.to,
            view:     isFrom ? calState.viewFrom : calState.viewTo,
            onPickDay(day) {
                const r = applyPick(calState.from, calState.to, calState.open, day);
                calState.from = r.from; calState.to = r.to;
                if (isFrom) calState.viewFrom = startOfDay(day); else calState.viewTo = startOfDay(day);
                closeCal();
                updateChips();
            },
            onNavigate(v) { if (isFrom) calState.viewFrom = v; else calState.viewTo = v; }
        });
    }
    function openCal(end) {
        calState.open = end;
        calOpen = true;
        calMount.classList.add('open');
        renderCalendar();
        updateChips();
        onPlaced();
    }
    function closeCal() { calOpen = false; calMount.classList.remove('open'); updateChips(); onPlaced(); }
    fieldFrom.addEventListener('click', () => calOpen && calState.open === 'from' ? closeCal() : openCal('from'));
    fieldTo.addEventListener('click',   () => calOpen && calState.open === 'to'   ? closeCal() : openCal('to'));
    updateChips();
}

// Optimistic bar: build a real-looking bar from the just-saved values and place it —
// replacing the edited bar, or appending to the lane on create.
function applyOptimisticAbsenceBar(opts, absenceTypeId, fromISO, toISO) {
    const rec = { _id: '__optimistic__', dateFrom: fromISO, dateTo: toISO, absenceType: absenceTypeId };
    const fresh = makeBar(rec, 'absence');
    fresh.classList.add('ptg-bar-pending');
    if (opts.bar && opts.bar.parentElement) opts.bar.replaceWith(fresh);
    else if (opts.track && opts.track.isConnected) opts.track.appendChild(fresh);
}
function applyOptimisticRequestBar(opts, fields, tradeSkillIds) {
    const rec = Object.assign({ _id: '__optimistic__' }, fields);
    // makeRequestBar reads skills from skillsByRequest (the junction join), not from a
    // field on the record — seed a synthetic entry so the optimistic bar's chips/title
    // reflect what was just picked, ahead of the persisted junction rows arriving.
    skillsByRequest.set('__optimistic__', tradeSkillIds.map(id => tradeSkillById.get(id)).filter(Boolean));
    const fresh = makeRequestBar(rec);
    fresh.classList.add('ptg-bar-pending');
    if (opts.bar && opts.bar.parentElement) opts.bar.replaceWith(fresh);
    else if (opts.track && opts.track.isConnected) opts.track.appendChild(fresh);
}

// ── Absence editor popover ───────────────────────────────────────────────────
// Simplified from assignment-grid/index.js:1073 (showAllocAbsencePopover) — the
// Tildeling/Fravær toggle is dropped entirely; this view only ever creates/edits
// absences (direct project assignment stays in assignment-grid).
// opts: { resourceId, recordId, absenceType, dateFrom, dateTo, anchorX, anchorY,
//         bar?, track?, onDelete? }
function showAbsencePopover(opts) {
    removePopover();
    activeEdit = true;

    const isEdit = !!opts.recordId;
    let selId = opts.absenceType ?? null;

    const seed = opts.dateFrom ? new Date(opts.dateFrom) : new Date();
    const calState = {
        from:     opts.dateFrom ? startOfDay(new Date(opts.dateFrom)) : null,
        to:       opts.dateTo   ? startOfDay(new Date(opts.dateTo))   : null,
        open:     'from',
        viewFrom: startOfDay(opts.dateFrom ? new Date(opts.dateFrom) : seed),
        viewTo:   startOfDay(opts.dateTo ? new Date(opts.dateTo)
                           : opts.dateFrom ? new Date(opts.dateFrom) : seed)
    };

    popoverEl = document.createElement('div');
    popoverEl.className = 'ptg-popover';
    popoverEl.innerHTML =
        '<div class="ptg-popover-title">Fravær</div>' +
        '<div class="ptg-pop-datefields">' +
            '<span class="ptg-datefield" data-end="from"><span class="ptg-df-label">Fra dato</span>' +
                '<span class="ptg-df-val ptg-chip-from">–</span><span class="ptg-df-cal">' + CAL_ICON + '</span></span>' +
            '<span class="ptg-datefield" data-end="to"><span class="ptg-df-label">Til dato</span>' +
                '<span class="ptg-df-val ptg-chip-to">–</span><span class="ptg-df-cal">' + CAL_ICON + '</span></span>' +
        '</div>' +
        '<div class="ptg-datepop"></div>' +
        '<div class="ptg-pop-list"></div>' +
        '<div class="ptg-pop-actions">' +
            (isEdit ? '<button type="button" class="ptg-pop-delete">' + TRASH_ICON + '<span>Slett</span></button>' : '') +
            '<button class="ptg-pop-confirm">Lagre</button>' +
        '</div>';
    document.body.appendChild(popoverEl);

    function placePopover() {
        const pw = popoverEl.offsetWidth  || 280;
        const ph = popoverEl.offsetHeight || 360;
        const M = 8;
        let left = opts.anchorX + 10;
        if (left + pw > window.innerWidth - M) left = opts.anchorX - pw - 10;
        let top = opts.anchorY - 16;
        if (top + ph > window.innerHeight - M) top = window.innerHeight - ph - M;
        popoverEl.style.left = Math.max(M, left) + 'px';
        popoverEl.style.top  = Math.max(M, top) + 'px';
    }

    const selMount = popoverEl.querySelector('.ptg-pop-list');
    function itemsForAbsence() {
        return Object.entries(absenceTypeMap).map(([v, info]) => ({ id: Number(v), label: info.name, color: info.color }));
    }
    makeFlatList(selMount, {
        items: itemsForAbsence(),
        value: selId,
        placeholder: 'Søk fraværstype…',
        onPick: (id) => { selId = id; }
    });

    wireDateFields(popoverEl, calState, seed, opts, placePopover);
    placePopover();

    function confirm() {
        if (selId == null) { selMount.classList.add('ptg-pop-invalid'); return; }
        const from = startOfDay(calState.from || seed);
        let to = endOfDay(calState.to || calState.from || (opts.dateTo ? new Date(opts.dateTo) : seed));
        if (+to < +from) to = endOfDay(from);
        removeOutsideHandler();
        const fromISO = from.toISOString(), toISO = to.toISOString();
        applyOptimisticAbsenceBar(opts, selId, fromISO, toISO);
        if (opts.recordId) {
            appfarm.actions?.[ACT.saveAbsenceDates]?.({
                absenceId: opts.recordId, dateFrom: fromISO, dateTo: toISO, abscenceType: Number(selId)
            });
        } else {
            appfarm.actions?.[ACT.save]?.({
                resourceId: opts.resourceId, dateFrom: fromISO, dateTo: toISO, abscenceType: Number(selId)
            });
        }
        removePopover();
    }
    function cancel() { removeOutsideHandler(); removePopover(); }
    function outsideHandler(e) { if (popoverEl && !popoverEl.contains(e.target)) cancel(); }
    function removeOutsideHandler() {
        document.removeEventListener('pointerdown', outsideHandler, { capture: true });
    }

    popoverEl.querySelector('.ptg-pop-confirm').addEventListener('click', confirm);
    if (isEdit) popoverEl.querySelector('.ptg-pop-delete').addEventListener('click', () => {
        removeOutsideHandler();
        appfarm.actions?.[ACT.deleteAbsence]?.({ [ACT.absenceIdParam]: opts.recordId });
        opts.onDelete?.();
        removePopover();
    });
    popoverEl.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    setTimeout(() =>
        document.addEventListener('pointerdown', outsideHandler, { capture: true }), 0);
}

// ── "Ask for more resources" popover ─────────────────────────────────────────
// New — the only popover with no direct assignment-grid precedent, though its
// shell (date fields/calendar/actions) follows the same pattern as
// showAbsencePopover above and resource-req-v2's showCountPopover.
// opts: { projectId, recordId, workType, tradeSkillIds, count, comment, dateFrom,
//         dateTo, anchorX, anchorY, bar?, track?, onDelete? }
function showAskPopover(opts) {
    removePopover();
    activeEdit = true;

    const isEdit = !!opts.recordId;
    let workType = opts.workType ?? null;
    let skillIds = new Set(opts.tradeSkillIds || []);

    const seed = opts.dateFrom ? new Date(opts.dateFrom) : new Date();
    const calState = {
        from:     opts.dateFrom ? startOfDay(new Date(opts.dateFrom)) : null,
        to:       opts.dateTo   ? startOfDay(new Date(opts.dateTo))   : null,
        open:     'from',
        viewFrom: startOfDay(opts.dateFrom ? new Date(opts.dateFrom) : seed),
        viewTo:   startOfDay(opts.dateTo ? new Date(opts.dateTo)
                           : opts.dateFrom ? new Date(opts.dateFrom) : seed)
    };

    popoverEl = document.createElement('div');
    popoverEl.className = 'ptg-popover ptg-popover-wide';
    popoverEl.innerHTML =
        '<div class="ptg-popover-title">Be om flere ressurser</div>' +
        '<div class="ptg-pop-list ptg-pop-worktype"></div>' +
        '<div class="ptg-pop-multiselect"></div>' +
        '<input class="ptg-popover-input" type="number" min="1" step="1" value="' + (opts.count ?? 1) + '" placeholder="Antall ressurser" />' +
        '<textarea class="ptg-textarea" placeholder="Kommentar — hvorfor/hvordan har behovet oppstått?"></textarea>' +
        '<div class="ptg-pop-datefields">' +
            '<span class="ptg-datefield" data-end="from"><span class="ptg-df-label">Fra dato</span>' +
                '<span class="ptg-df-val ptg-chip-from">–</span><span class="ptg-df-cal">' + CAL_ICON + '</span></span>' +
            '<span class="ptg-datefield" data-end="to"><span class="ptg-df-label">Til dato</span>' +
                '<span class="ptg-df-val ptg-chip-to">–</span><span class="ptg-df-cal">' + CAL_ICON + '</span></span>' +
        '</div>' +
        '<div class="ptg-datepop"></div>' +
        '<div class="ptg-pop-actions">' +
            (isEdit ? '<button type="button" class="ptg-pop-delete">' + TRASH_ICON + '<span>Slett</span></button>' : '') +
            '<button class="ptg-pop-confirm">Lagre</button>' +
        '</div>';
    document.body.appendChild(popoverEl);

    function placePopover() {
        const pw = popoverEl.offsetWidth  || 300;
        const ph = popoverEl.offsetHeight || 460;
        const M = 8;
        let left = opts.anchorX + 10;
        if (left + pw > window.innerWidth - M) left = opts.anchorX - pw - 10;
        let top = opts.anchorY - 16;
        if (top + ph > window.innerHeight - M) top = window.innerHeight - ph - M;
        popoverEl.style.left = Math.max(M, left) + 'px';
        popoverEl.style.top  = Math.max(M, top) + 'px';
    }

    const wtMount = popoverEl.querySelector('.ptg-pop-worktype');
    makeFlatList(wtMount, {
        items: Object.entries(wtNameMap).map(([v, name]) => ({ id: Number(v), label: name })),
        value: workType,
        placeholder: 'Søk fagtype…',
        onPick: (id) => { workType = id; }
    });

    const skillMount = popoverEl.querySelector('.ptg-pop-multiselect');
    makeMultiSelect(skillMount, {
        items: [...tradeSkillById.values()].map(s => ({ id: s._id, label: s.name })),
        values: skillIds,
        placeholder: 'Søk fag…',
        onChange: (ids) => { skillIds = new Set(ids); }
    });

    const countInput = /** @type {HTMLInputElement} */ (popoverEl.querySelector('.ptg-popover-input'));
    const commentInput = /** @type {HTMLTextAreaElement} */ (popoverEl.querySelector('.ptg-textarea'));
    commentInput.value = opts.comment || '';

    wireDateFields(popoverEl, calState, seed, opts, placePopover);
    placePopover();

    function confirm() {
        if (workType == null) { wtMount.classList.add('ptg-pop-invalid'); return; }
        const count = Math.max(1, parseInt(countInput.value, 10) || 1);
        const comment = commentInput.value.trim();
        const from = startOfDay(calState.from || seed);
        let to = endOfDay(calState.to || calState.from || (opts.dateTo ? new Date(opts.dateTo) : seed));
        if (+to < +from) to = endOfDay(from);
        removeOutsideHandler();
        const fromISO = from.toISOString(), toISO = to.toISOString();
        const tradeSkillIds = [...skillIds];
        applyOptimisticRequestBar(opts, {
            workType, resourceCount: count, comment, dateFrom: fromISO, dateTo: toISO
        }, tradeSkillIds);
        if (opts.recordId) {
            appfarm.actions?.updateProjectResourceRequest?.({
                projectResourceRequestId: opts.recordId, dateFrom: fromISO, dateTo: toISO,
                count, tradeSkillIds, comment
            });
        } else {
            appfarm.actions?.createProjectResourceRequest?.({
                projectId: opts.projectId, workType, tradeSkillIds, count, comment,
                dateFrom: fromISO, dateTo: toISO
            });
        }
        removePopover();
    }
    function cancel() { removeOutsideHandler(); removePopover(); }
    function outsideHandler(e) { if (popoverEl && !popoverEl.contains(e.target)) cancel(); }
    function removeOutsideHandler() {
        document.removeEventListener('pointerdown', outsideHandler, { capture: true });
    }

    popoverEl.querySelector('.ptg-pop-confirm').addEventListener('click', confirm);
    if (isEdit) popoverEl.querySelector('.ptg-pop-delete').addEventListener('click', () => {
        removeOutsideHandler();
        appfarm.actions?.deleteProjectResourceRequest?.({ projectResourceRequestId: opts.recordId });
        opts.onDelete?.();
        removePopover();
    });
    popoverEl.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    setTimeout(() =>
        document.addEventListener('pointerdown', outsideHandler, { capture: true }), 0);
}

// ponytail: console-only self-check for the day-clamp logic — call demo() from the
// browser console after pasting. Not auto-run (would log on every load).
// Ported from assignment-grid/index.js:1325-1336 — verbatim.
function demo() {
    const aug10 = new Date(2026, 7, 10), aug20 = new Date(2026, 7, 20);
    let r = applyPick(aug20, null, 'to', aug10);
    console.assert(+r.to === +startOfDay(aug10), 'to set to picked day');
    r = applyPick(aug20, aug20, 'to', aug10);
    console.assert(+r.from === +startOfDay(aug10), 'to before from pulls from back');
    r = applyPick(aug10, aug10, 'from', aug20);
    console.assert(+r.to === +startOfDay(aug20), 'from after to pushes to forward');
    r = applyPick(aug10, aug20, 'from', new Date(2026, 7, 12));
    console.assert(+r.to === +startOfDay(aug20), 'other end untouched when order ok');
    console.log('[project-team-grid] day-picker self-check passed');
}

// ── Interaction (pointer-based: create / move / resize) ────────
// Ported from assignment-grid/index.js:1339-1350 — verbatim, pl- → ptg-.
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

// Adapted from assignment-grid/index.js:1352-1396 (onPointerDown) — branches on
// which row kind was hit (`resource` vs `request`) instead of always assuming a
// resource lane; alloc/other-alloc bars (dataset.kind !== 'absence'/'request')
// are inert by construction (guarded out before activeDrag is ever set).
function onPointerDown(e) {
    if (e.button !== 0) return;
    const track = e.target.closest('.ptg-track');
    if (!track) return;
    const rowKind = track.dataset.rowKind; // 'resource' | 'request'
    const bar = e.target.closest('.ptg-bar');

    if (bar && bar.classList.contains('ptg-bar-readonly')) return; // this/other-project allocation — never draggable

    const trackRect = track.getBoundingClientRect();

    if (bar) {
        const kind = bar.dataset.kind; // 'absence' | 'request'
        const id = kind === 'absence' ? bar.dataset.absenceId : bar.dataset.requestId;
        const rec = (kind === 'absence' ? absenceById : requestById).get(id);
        if (!rec) return;

        const handle = e.target.closest('.ptg-handle');
        const mode = handle ? (handle.dataset.edge === 'l' ? 'resize-l' : 'resize-r') : 'move';
        activeDrag = {
            mode, kind, bar, recId: id,
            resourceId: kind === 'absence' ? track.dataset.resourceId : null,
            origFrom: startOfDay(new Date(rec.dateFrom)),
            origTo:   endOfDay(new Date(rec.dateTo)),
            startClientX: e.clientX, moved: false,
            origZ: bar.style.zIndex
        };
        bar.style.zIndex = '4';
    } else {
        const downIdx = colIndexFromClientX(e.clientX, trackRect);
        const ghost = document.createElement('div');
        ghost.className = 'ptg-bar ptg-bar-ghost';
        ghost.style.left = (downIdx * COLW[granularity]) + 'px';
        ghost.style.width = COLW[granularity] + 'px';
        track.appendChild(ghost);
        activeDrag = {
            mode: 'create', kind: rowKind === 'request' ? 'request' : 'absence',
            bar: ghost, resourceId: track.dataset.resourceId || null,
            origS: downIdx, origE: downIdx, startClientX: e.clientX, moved: false, track, trackRect
        };
    }
    document.getElementById('planner-inner')?.classList.add('ptg-dragging');
    e.preventDefault();
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
}

// Ported from assignment-grid/index.js:1398-1438 (onPointerMove) — verbatim, the
// drag math doesn't care whether `kind` is 'absence' or 'request'.
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

// Opens the create popover for a brand-new absence/request span. `track` carries
// dataset.resourceId (absence) — resourceId is read straight off it for that case.
// Shared by the mouse drag-to-create path (onPointerUp) and the touch tap path
// (onTouchPointerUp).
function openCreatePopover(kind, track, colS, colE, anchorX, anchorY) {
    const s = clampIdx(colS), eIdx = clampIdx(colE);
    const dateFrom = columns[s].start.toISOString();
    const dateTo   = columns[eIdx].end.toISOString();
    if (kind === 'request') {
        showAskPopover({
            projectId: currentProjectId, recordId: null,
            dateFrom, dateTo,
            anchorX, anchorY, track
        });
    } else {
        showAbsencePopover({
            resourceId: track.dataset.resourceId || null, recordId: null,
            dateFrom, dateTo,
            anchorX, anchorY, track
        });
    }
}

// Opens the edit popover for an existing absence/request bar. Shared by the
// mouse click-without-dragging path (onPointerUp) and the touch tap path
// (onTouchPointerUp).
function openEditPopover(kind, recId, resourceId, bar, anchorX, anchorY) {
    if (kind === 'request') {
        const rec = requestById.get(recId);
        const skillIds = (skillsByRequest.get(recId) || []).map(s => s._id);
        showAskPopover({
            projectId: currentProjectId, recordId: recId,
            workType: rec?.workType, tradeSkillIds: skillIds, count: rec?.resourceCount,
            comment: rec?.comment, dateFrom: rec?.dateFrom, dateTo: rec?.dateTo,
            anchorX, anchorY, bar, onDelete: () => bar?.remove()
        });
    } else {
        const rec = absenceById.get(recId);
        showAbsencePopover({
            resourceId, recordId: recId,
            absenceType: rec?.absenceType, dateFrom: rec?.dateFrom, dateTo: rec?.dateTo,
            anchorX, anchorY, bar, onDelete: () => bar?.remove()
        });
    }
}

// Adapted from assignment-grid/index.js:1440-1513 (onPointerUp) — branches on
// `d.kind` ('absence' | 'request') to open the right popover / call the right
// update action; the allocation branch from assignment-grid is gone entirely.
function onPointerUp(e) {
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    document.getElementById('planner-inner')?.classList.remove('ptg-dragging');
    hideTooltip();
    const d = activeDrag;
    activeDrag = null;
    if (!d) return;

    if (d.mode !== 'create' && d.bar) d.bar.style.zIndex = d.origZ || '';

    const popoverX = Math.round(e.clientX), popoverY = Math.round(e.clientY);

    if (d.mode === 'create') {
        d.bar.remove();
        openCreatePopover(d.kind, d.track, d.curS ?? d.origS, d.curE ?? d.origE, popoverX, popoverY);
        return;
    }

    if (!d.moved) {
        openEditPopover(d.kind, d.recId, d.resourceId, d.bar, popoverX, popoverY);
        return;
    }

    let from = d.curFrom ?? d.origFrom;
    let to   = d.curTo   ?? d.origTo;
    if (granularity === 'week') { from = startOfWeekMon(from); to = endOfWeekMon(to); }
    if (+to < +from) to = endOfDay(from);
    const dateFrom = from.toISOString(), dateTo = to.toISOString();

    if (d.kind === 'request') {
        const rec = requestById.get(d.recId);
        const skillIds = (skillsByRequest.get(d.recId) || []).map(s => s._id);
        appfarm.actions?.updateProjectResourceRequest?.({
            projectResourceRequestId: d.recId, dateFrom, dateTo,
            count: rec?.resourceCount, tradeSkillIds: skillIds, comment: rec?.comment
        });
    } else {
        const rec = absenceById.get(d.recId);
        appfarm.actions?.[ACT.saveAbsenceDates]?.({
            absenceId: d.recId, dateFrom, dateTo, abscenceType: Number(rec?.absenceType)
        });
    }
    flushQueuedRebuild();
}

// Touch has no precision for drag-to-resize/move on a 75px column, and any drag on
// the timeline competes with the scroll needed to reach other weeks — so touch taps
// open the same create/edit popover mouse gets on a plain (non-dragged) click,
// instead of trying to reimplement drag for touch. Never preventDefault/capture here:
// native scroll must stay fully alive so `pointercancel` (below) is the browser's own
// signal that a gesture became a scroll, not a tap.
function onTouchPointerDown(e) {
    if (e.pointerType !== 'touch') return;
    const track = e.target.closest('.ptg-track');
    if (!track) return;
    const bar = e.target.closest('.ptg-bar');
    if (bar && bar.classList.contains('ptg-bar-readonly')) return;

    touchTap = {
        pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false,
        track, trackRect: track.getBoundingClientRect(),
        bar, rowKind: track.dataset.rowKind
    };
    document.addEventListener('pointermove', onTouchPointerMove);
    document.addEventListener('pointerup', onTouchPointerUp);
    document.addEventListener('pointercancel', onTouchPointerCancel);
}

function onTouchPointerMove(e) {
    if (!touchTap || e.pointerId !== touchTap.pointerId) return;
    if (Math.hypot(e.clientX - touchTap.startX, e.clientY - touchTap.startY) > TOUCH_TAP_SLOP) {
        touchTap.moved = true;
    }
}

function onTouchPointerCancel(e) {
    if (!touchTap || e.pointerId !== touchTap.pointerId) return;
    cleanupTouchTap();
}

function onTouchPointerUp(e) {
    if (!touchTap || e.pointerId !== touchTap.pointerId) return;
    const t = touchTap;
    cleanupTouchTap();
    if (t.moved) return; // browser took it as a scroll, not a tap

    const x = Math.round(e.clientX), y = Math.round(e.clientY);
    if (t.bar) {
        const kind = t.bar.dataset.kind;
        const recId = kind === 'absence' ? t.bar.dataset.absenceId : t.bar.dataset.requestId;
        if (!recId) return;
        openEditPopover(kind, recId, t.track.dataset.resourceId || null, t.bar, x, y);
    } else {
        const colIdx = colIndexFromClientX(t.startX, t.trackRect);
        openCreatePopover(t.rowKind === 'request' ? 'request' : 'absence', t.track, colIdx, colIdx, x, y);
    }
}

function cleanupTouchTap() {
    document.removeEventListener('pointermove', onTouchPointerMove);
    document.removeEventListener('pointerup', onTouchPointerUp);
    document.removeEventListener('pointercancel', onTouchPointerCancel);
    touchTap = null;
}

// ── Lifecycle ──────────────────────────────────────────────────
// Adapted from assignment-grid/index.js:1524-1537 (ensureSkeleton) — root id is
// #team-planner (not #planner) and internal ids are namespaced (team-planner-*,
// ptg-*) so this component can coexist on a page with assignment-grid without
// id collisions; sortByProjects control dropped.
function ensureSkeleton() {
    const root = document.getElementById('team-planner');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
        <div class="ptg-controls">
            <input id="search-input" class="ptg-search" placeholder="Søk ressurs / fag" />
            <div class="ptg-gran" id="granularity-toggle">
                <button data-granularity="week" class="active">Uker</button>
                <button data-granularity="day">Dager</button>
            </div>
        </div>
        <div id="planner-scroll" class="ptg-scroll"><div id="planner-inner" class="ptg-inner"></div></div>`;
}

let initialized = false;
function init() {
    if (initialized) return;
    initialized = true;
    ensureSkeleton();

    applyGranularity(appfarm.data.viewGranularity?.get?.());

    const inner = document.getElementById('planner-inner');
    inner?.addEventListener('mousedown', onPointerDown);
    inner?.addEventListener('pointerdown', onTouchPointerDown);

    let deb;
    document.getElementById('search-input')?.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(guardedBuildAll, 150); });

    // Re-lays-out the sticky column / grid when the container crosses the
    // responsive breakpoint (see getStickyW) — e.g. on phone rotation.
    let resizeDeb;
    new ResizeObserver(() => { clearTimeout(resizeDeb); resizeDeb = setTimeout(guardedBuildAll, 150); })
        .observe(document.getElementById('team-planner'));

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

    ['project', 'viewFrom', 'viewTo', 'resources', 'projects', 'allocation', 'absence',
     'workTypeEnum', 'absenceColors', 'tradeSkills', 'projectResourceRequests',
     'projectResourceRequestTradeSkills']
        .forEach(h => appfarm.data[h]?.on?.('change', guardedBuildAll));
}

if (document.readyState === 'complete' || document.readyState === 'interactive') init();
else document.addEventListener('DOMContentLoaded', init);
