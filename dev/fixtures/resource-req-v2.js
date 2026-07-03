// Mock data for resource-req-v2. Fields mirror the real DB schema (camelCased);
// enum/reference fields carry real integer ids. References use raw id strings
// (resolveId accepts a string or a {_id} object).
window.FIXTURES = window.FIXTURES || {};

// Work Type enum ids: 250 Tømrer, 20 Betong, 190 Rørlegger, 40 Elektriker bolig
// Resource Need Source ids: 10 Behov, 20 Egne, 30 Innleide, 35 Utleide, 40 Udekt, 50 Overskudd
const iso = (s) => s; // viewFrom/From dates are passed to new Date() — ISO strings are fine

window.FIXTURES['resource-req-v2'] = {
  viewFrom: '2026-06-01',
  viewTo: '2026-08-23',
  calendarWeekWidthPixel: 44,

  workTypeEnum: [
    { enum_value: 250, enum_name: 'Tømrer' },
    { enum_value: 20, enum_name: 'Betong' },
    { enum_value: 190, enum_name: 'Rørlegger' },
    { enum_value: 40, enum_name: 'Elektriker bolig' },
  ],

  source: [
    { enum_value: 10, enum_name: 'Behov' },
    { enum_value: 20, enum_name: 'Egne' },
    { enum_value: 30, enum_name: 'Innleide' },
    { enum_value: 35, enum_name: 'Utleide' },
    { enum_value: 40, enum_name: 'Udekt' },
    { enum_value: 50, enum_name: 'Overskudd' },
  ],

  projects: [
    { _id: 'p1', name: 'Nytt Sykehus', colorHexCode: '#88c8ed', detailsShowBOL: true },
    { _id: 'p2', name: 'Boligfelt Vest', colorHexCode: '#b5cfaa', detailsShowBOL: false },
  ],

  // Which work types each project needs (drives the detail rows).
  projectWorkType: [
    { _id: 'pwt1', project: 'p1', workType: 250 },
    { _id: 'pwt2', project: 'p1', workType: 20 },
    { _id: 'pwt3', project: 'p2', workType: 190 },
    { _id: 'pwt4', project: 'p2', workType: 40 },
  ],

  // Project Requirement: Behov bars per work type (the editable demand).
  // p1/Betong(20) is tuned to walk the band through all four states across its
  // Behov span: deficit → covered → surplus, bracketed by no-demand outside it.
  projectRequirements: [
    { _id: 'r1', project: 'p1', source: 10, workType: 250, resourceCount: 4, dateFrom: iso('2026-06-08'), dateTo: iso('2026-07-19') },
    { _id: 'r2', project: 'p1', source: 10, workType: 20, resourceCount: 2, dateFrom: iso('2026-06-15'), dateTo: iso('2026-08-02') },
    { _id: 'r3', project: 'p1', source: 30, workType: 250, resourceCount: 1, dateFrom: iso('2026-06-22'), dateTo: iso('2026-07-12') },
    { _id: 'r5', project: 'p1', source: 30, workType: 20,  resourceCount: 1, dateFrom: iso('2026-06-22'), dateTo: iso('2026-07-12') }, // Innleide → covered window
    { _id: 'r4', project: 'p2', source: 10, workType: 190, resourceCount: 3, dateFrom: iso('2026-06-01'), dateTo: iso('2026-07-05') },
  ],

  // Allocations of real people → Egne aggregate (distinct persons per week, minus absent).
  allocation: [
    { _id: 'a1', project: 'p1', resource: 'res1', workType: 250, dateFrom: iso('2026-06-08'), dateTo: iso('2026-07-19') },
    { _id: 'a2', project: 'p1', resource: 'res2', workType: 250, dateFrom: iso('2026-06-08'), dateTo: iso('2026-07-19') },
    { _id: 'a3', project: 'p1', resource: 'res3', workType: 20, dateFrom: iso('2026-06-15'), dateTo: iso('2026-08-02') },
    { _id: 'a5', project: 'p1', resource: 'res5', workType: 20, dateFrom: iso('2026-07-13'), dateTo: iso('2026-08-02') }, // 2nd own person → covered
    { _id: 'a6', project: 'p1', resource: 'res6', workType: 20, dateFrom: iso('2026-07-20'), dateTo: iso('2026-08-02') }, // 3rd own person → surplus (-1)
    { _id: 'a7', project: 'p1', resource: 'res7', workType: 190, dateFrom: iso('2026-06-15'), dateTo: iso('2026-07-19') }, // trade p1 never planned → exception band (all no-demand)
    { _id: 'a4', project: 'p2', resource: 'res4', workType: 190, dateFrom: iso('2026-06-01'), dateTo: iso('2026-07-05') },
  ],

  // res1 on holiday one week → drops out of Egne for that column.
  absence: [
    { _id: 'ab1', resource: 'res1', dateFrom: iso('2026-06-29'), dateTo: iso('2026-07-05') },
  ],

  // Resource Available ads (lease-IN supply) — surface on DEFICIT band weeks.
  // p1/Tømrer(250) runs deficit throughout; these span it across the three tiers.
  // tier: 1 internt, 2 partner, 3 alle. company carries the posting company name.
  resourcesAvailable: [
    { _id: 'ra1', workType: 250, company: { _id: 'c2', name: 'Bygg & Co' },        tier: 1, numberOfResources: 2, dateStart: iso('2026-06-08'), dateEnd: iso('2026-06-28'), title: '2 tømrere ledig' },
    { _id: 'ra2', workType: 250, company: { _id: 'c3', name: 'Nord Entreprenør' }, tier: 2, numberOfResources: 1, dateStart: iso('2026-06-22'), dateEnd: iso('2026-07-12'), title: 'Tømrer ledig' },
    { _id: 'ra3', workType: 250, company: { _id: 'c4', name: 'SørBygg' },          tier: 3, numberOfResources: 3, dateStart: iso('2026-07-06'), dateEnd: iso('2026-07-19'), title: 'Tømrerlag' },
  ],

  // Job ads (lease-OUT demand) — surface on SURPLUS band weeks.
  // p1/Betong(20) goes surplus 07-20..08-02; two companies overlap → "N selskaper".
  jobs: [
    { _id: 'j1', workType: 20, company: { _id: 'c5', name: 'Betong Spesialisten' }, tier: 1, numberOfResources: 1, dateStart: iso('2026-07-20'), dateEnd: iso('2026-08-02'), title: 'Betongoppdrag' },
    { _id: 'j2', workType: 20, company: { _id: 'c6', name: 'Anlegg AS' },           tier: 3, numberOfResources: 2, dateStart: iso('2026-07-20'), dateEnd: iso('2026-08-09'), title: 'Stor betongjobb' },
  ],

  // Anonymized peer-org allocation windows — same shape as `allocation`
  // (resource, project, workType, dateFrom, dateTo), resource identity stripped.
  // No company/title/count — the component derives "N stk" by counting
  // overlapping free (project: null) records per tier. Overlaps p1/Tømrer(250),
  // same window as resourcesAvailable above, to exercise real-before-probable
  // ordering directly against known real-ad tiers.
  peerAllocations: [
    { _id: 'pa1', project: null, workType: 250, tier: 1, dateFrom: iso('2026-06-10'), dateTo: iso('2026-06-24') },
    { _id: 'pa2', project: null, workType: 250, tier: 1, dateFrom: iso('2026-06-15'), dateTo: iso('2026-06-29') },
    { _id: 'pa3', project: null, workType: 250, tier: 3, dateFrom: iso('2026-07-01'), dateTo: iso('2026-07-15') },
    { _id: 'pa4', project: 'p9', workType: 250, tier: 1, dateFrom: iso('2026-06-10'), dateTo: iso('2026-06-24') }, // committed elsewhere — must be excluded
  ],
};
