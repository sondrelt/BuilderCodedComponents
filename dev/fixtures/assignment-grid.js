// Mock data for assignment-grid (resource × time planner). Resources get
// allocation/absence bars; jobs (open ads) match resources by workType and fill
// free gaps. References use raw id strings (resolveId handles strings).
window.FIXTURES = window.FIXTURES || {};

// Inline data-URI SVGs standing in for the real workTypeIcons.__fileContentLink
// (a signed image URL) — just a colored circle + initial, one per work type.
function svgIcon(letter, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">` +
    `<circle cx="12" cy="12" r="11" fill="${bg}"/>` +
    `<text x="12" y="16" font-size="11" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

window.FIXTURES['assignment-grid'] = {
  viewFrom: '2026-06-01',
  viewTo: '2026-08-09',
  viewGranularity: 'week',
  sortByProjects: true,

  workTypeEnum: [
    { enum_value: 250, enum_name: 'Tømrer' },
    { enum_value: 20, enum_name: 'Betong' },
    { enum_value: 190, enum_name: 'Rørlegger' },
  ],

  // Stand-in for the real Appfarm file-field data — __fileContentLink is a
  // signed GCS URL in production; any image URL works the same here.
  workTypeIcons: [
    { workType: 250, __fileContentLink: svgIcon('T', '#8b5e34') },
    { workType: 20, __fileContentLink: svgIcon('B', '#6b7280') },
    { workType: 190, __fileContentLink: svgIcon('R', '#1e86c4') },
  ],

  // Trade Skill catalog — resourceTradeSkills.tradeSkill below is a plain id
  // string into this (not expanded by Appfarm), joined client-side in index.js.
  tradeSkills: [
    { _id: 'sk1', name: 'Trearbeid', description: 'Spesialisert på treskjæring (wood carving)' },
    { _id: 'sk2', name: 'Sveising', description: 'Sertifisert TIG-sveiser' },
    { _id: 'sk3', name: 'Muring', description: 'Naturstein og gammel-mur restaurering' },
  ],

  // Resource -> Trade Skill junction records (both fields plain id strings).
  // res1 has two (tests chip overflow + ordering against a role tag, since
  // p1.projectManager is res1 below); res2/res4 have none (no-chip case).
  resourceTradeSkills: [
    { _id: 'ts1', resource: 'res1', tradeSkill: 'sk1' },
    { _id: 'ts2', resource: 'res1', tradeSkill: 'sk2' },
    { _id: 'ts3', resource: 'res3', tradeSkill: 'sk3' },
  ],

  // Absence Type → colour. absenceValue matches absence.absenceType ids.
  absenceColors: [
    { absenceValue: 20, absenceName: 'Ferie', colorHexCode: '#fddfba' },
    { absenceValue: 40, absenceName: 'Fravær', colorHexCode: '#efc9c8' },
    { absenceValue: 60, absenceName: 'Permittert', colorHexCode: '#b5cfaa' },
    { absenceValue: 80, absenceName: 'Sykemeldt', colorHexCode: '#f7e4e3' },
  ],

  resources: [
    { _id: 'res1', fullNameFx: 'Ola Nordmann', workType: 250, position: 'Tømrer' },
    { _id: 'res2', fullNameFx: 'Kari Hansen', workType: 250, position: 'Tømrer' },
    { _id: 'res3', fullNameFx: 'Per Johansen', workType: 20, position: 'Betongarbeider' },
    { _id: 'res4', fullNameFx: 'Nina Berg', workType: 190, position: 'Rørlegger' },
  ],

  projects: [
    { _id: 'p1', name: 'Nytt Sykehus', projectManager: 'res1' },
    { _id: 'p2', name: 'Boligfelt Vest' },
  ],

  allocation: [
    { _id: 'a1', resource: 'res1', project: 'p1', workType: 250, dateFrom: '2026-06-08', dateTo: '2026-08-09' },
    { _id: 'a2', resource: 'res2', project: 'p1', workType: 250, dateFrom: '2026-06-15', dateTo: '2026-07-26' },
    { _id: 'a3', resource: 'res3', project: 'p2', workType: 20, dateFrom: '2026-06-01', dateTo: '2026-06-28' },
    { _id: 'a4', resource: 'res4', project: 'p2', workType: 190, dateFrom: '2026-06-22', dateTo: '2026-08-02' },
  ],

  absence: [
    { _id: 'ab1', resource: 'res1', absenceType: 20, dateFrom: '2026-07-13', dateTo: '2026-07-26' },
    { _id: 'ab2', resource: 'res3', absenceType: 80, dateFrom: '2026-07-06', dateTo: '2026-07-12' },
  ],

  // Open ads: shown in free gaps of resources with the matching workType.
  // tier (1 internt, 2 partner, 3 alle) ranks ads in a gap; company names the poster.
  // Two Tømrer ads share res1/res2 gaps → collapse to "Bygg & Co +1 andre", green (internt).
  jobs: [
    { _id: 'j1', workType: 250, company: { _id: 'c2', name: 'Bygg & Co' },        tier: 1, numberOfResources: 2, dateStart: '2026-07-06', dateEnd: '2026-08-02' },
    { _id: 'j3', workType: 250, company: { _id: 'c4', name: 'SørBygg' },          tier: 3, numberOfResources: 1, dateStart: '2026-07-13', dateEnd: '2026-07-26' },
    { _id: 'j2', workType: 190, company: { _id: 'c3', name: 'Nord Entreprenør' }, tier: 2, numberOfResources: 1, dateStart: '2026-06-01', dateEnd: '2026-06-21' },
  ],

  // Requests raised in project-team-grid, surfaced here read-only. req1's
  // window (06-01–06-14) sits in the gap before res2's p1 allocation starts
  // (06-15) — exercises comparing the request bar against the team's actual
  // gaps. req3 is already isResolved and must NOT appear (indexData filters
  // it out of requestsByProject), proving the resolve flag round-trips.
  projectResourceRequests: [
    { _id: 'req1', project: 'p1', workType: 250, resourceCount: 1,
      comment: 'Trenger en til tømrer før uke 25.',
      dateFrom: '2026-06-01', dateTo: '2026-06-14' },
    { _id: 'req2', project: 'p2', workType: 190, resourceCount: 1,
      comment: 'Ekstra rørlegger til grunnarbeid.',
      dateFrom: '2026-06-01', dateTo: '2026-06-21' },
    { _id: 'req3', project: 'p1', workType: 20, resourceCount: 1,
      comment: 'Løst allerede, skal ikke vises.',
      dateFrom: '2026-06-01', dateTo: '2026-06-10', isResolved: true },
  ],
};
