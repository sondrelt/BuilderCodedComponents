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
  projectRequirements: [
    { _id: 'r1', project: 'p1', source: 10, workType: 250, resourceCount: 4, dateFrom: iso('2026-06-08'), dateTo: iso('2026-07-19') },
    { _id: 'r2', project: 'p1', source: 10, workType: 20, resourceCount: 2, dateFrom: iso('2026-06-15'), dateTo: iso('2026-08-02') },
    { _id: 'r3', project: 'p1', source: 30, workType: 250, resourceCount: 1, dateFrom: iso('2026-06-22'), dateTo: iso('2026-07-12') },
    { _id: 'r4', project: 'p2', source: 10, workType: 190, resourceCount: 3, dateFrom: iso('2026-06-01'), dateTo: iso('2026-07-05') },
  ],

  // Allocations of real people → Egne aggregate (distinct persons per week, minus absent).
  allocation: [
    { _id: 'a1', project: 'p1', resource: 'res1', workType: 250, dateFrom: iso('2026-06-08'), dateTo: iso('2026-07-19') },
    { _id: 'a2', project: 'p1', resource: 'res2', workType: 250, dateFrom: iso('2026-06-08'), dateTo: iso('2026-07-19') },
    { _id: 'a3', project: 'p1', resource: 'res3', workType: 20, dateFrom: iso('2026-06-15'), dateTo: iso('2026-08-02') },
    { _id: 'a4', project: 'p2', resource: 'res4', workType: 190, dateFrom: iso('2026-06-01'), dateTo: iso('2026-07-05') },
  ],

  // res1 on holiday one week → drops out of Egne for that column.
  absence: [
    { _id: 'ab1', resource: 'res1', dateFrom: iso('2026-06-29'), dateTo: iso('2026-07-05') },
  ],
};
