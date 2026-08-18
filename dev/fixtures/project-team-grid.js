// Mock data for project-team-grid (per-project, resource-centric team timeline).
// One instance is bound to a single `project`; team rows are derived client-side
// from `allocation` (not a pre-filtered `resources` list) — res3 below has no
// allocation to p1 at all and must NOT appear as a row.
window.FIXTURES = window.FIXTURES || {};

window.FIXTURES['project-team-grid'] = {
  viewFrom: '2026-06-01',
  viewTo: '2026-08-09',
  viewGranularity: 'week',

  project: { _id: 'p1', name: 'Nytt Sykehus', colorHexCode: '#1e86c4' },

  projects: [
    { _id: 'p1', name: 'Nytt Sykehus', colorHexCode: '#1e86c4' },
    { _id: 'p2', name: 'Boligfelt Vest', colorHexCode: '#6ea15a' },
  ],

  workTypeEnum: [
    { enum_value: 250, enum_name: 'Tømrer' },
    { enum_value: 20, enum_name: 'Betong' },
    { enum_value: 190, enum_name: 'Rørlegger' },
  ],

  // Trade Skill catalog for the "ask for more resources" multi-select.
  tradeSkills: [
    { _id: 'sk1', name: 'Trearbeid', description: 'Spesialisert på treskjæring (wood carving)' },
    { _id: 'sk2', name: 'Sveising', description: 'Sertifisert TIG-sveiser' },
    { _id: 'sk3', name: 'Muring', description: 'Naturstein og gammel-mur restaurering' },
  ],

  absenceColors: [
    { absenceValue: 20, absenceName: 'Ferie', colorHexCode: '#fddfba' },
    { absenceValue: 40, absenceName: 'Fravær', colorHexCode: '#efc9c8' },
    { absenceValue: 60, absenceName: 'Permittert', colorHexCode: '#b5cfaa' },
    { absenceValue: 80, absenceName: 'Sykemeldt', colorHexCode: '#f7e4e3' },
  ],

  // res1, res2 are on p1's team (have an allocation to p1 overlapping the view
  // window). res3 is NOT — only allocated to p2 — and must not render as a row.
  resources: [
    { _id: 'res1', fullNameFx: 'Ola Nordmann', workType: 250, position: 'Tømrer' },
    { _id: 'res2', fullNameFx: 'Kari Hansen', workType: 20, position: 'Betongarbeider' },
    { _id: 'res3', fullNameFx: 'Per Johansen', workType: 190, position: 'Rørlegger' },
  ],

  allocation: [
    { _id: 'a1', resource: 'res1', project: 'p1', workType: 250, dateFrom: '2026-06-08', dateTo: '2026-08-09' },
    { _id: 'a2', resource: 'res2', project: 'p1', workType: 20, dateFrom: '2026-06-15', dateTo: '2026-07-12' },
    // res2 is also allocated to p2 for an overlapping stretch — exercises the
    // grayed-out .ptg-bar-other-project rendering on their row.
    { _id: 'a3', resource: 'res2', project: 'p2', workType: 20, dateFrom: '2026-07-13', dateTo: '2026-08-02' },
    { _id: 'a4', resource: 'res3', project: 'p2', workType: 190, dateFrom: '2026-06-01', dateTo: '2026-08-09' },
  ],

  absence: [
    { _id: 'ab1', resource: 'res1', absenceType: 20, dateFrom: '2026-07-13', dateTo: '2026-07-26' },
  ],

  // Existing ask on p1 — exercises edit-prefill of showAskPopover (work type,
  // checked skills, count, comment, dates).
  projectResourceRequests: [
    {
      _id: 'req1', project: 'p1', workType: 190,
      resourceCount: 2,
      comment: 'Trenger sveiser til rørarbeid før støping starter.',
      dateFrom: '2026-07-01', dateTo: '2026-07-21',
    },
  ],

  // Many-to-many junction: which trade skills req1 asks for. Both fields plain id
  // strings, not expanded — same non-expansion pattern as resourceTradeSkills.
  projectResourceRequestTradeSkills: [
    { _id: 'prts1', projectResourceRequest: 'req1', tradeSkill: 'sk2' },
  ],
};
