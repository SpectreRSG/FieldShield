# FieldShield

**Property Inspection Platform — _Inspect. Document. Verify._**

FieldShield is a mobile-first, offline-capable web application for property claims specialists conducting residential field inspections. It combines five modules on one shared inspection record:

| # | Module | What it does |
|---|--------|--------------|
| 1 | **Inspection Mission Control** | Create/edit/archive inspections, loss types, configurable checklists (pre-inspection, field, departure), areas (elevations, roof planes, rooms), observations, follow-up tasks, gaps, history, 13-step workflow tracker |
| 2 | **Roof & Room Measurement Calculator** | Roof planes (rectangle/triangle/trapezoid, slope or plan dimensions with pitch factor), ridges/hips/valleys/eaves/rakes, waste scenarios kept separate from measured area, rooms with openings and irregular segments, formulas and value sources shown, worksheet export |
| 3 | **Photo Evidence Organizer** | Camera capture and import, classification (area, component, shot type, damage category), correctable suggestions, captions/labels, observation links, per-area photo checklist, annotation as separate copies, numbered photo index |
| 4 | **Field Notes & Report Assistant** | Structured notes (direct observation / reported statement / calculation / assumption / preliminary interpretation / unresolved question), optional dictation, consistency flags, generated editable report with damage table, section approval, versions, PDF |
| 5 | **Estimate Quality-Control Assistant** | Manual entry or CSV import with column mapping, rules engine (arithmetic, duplicates, quantity vs measurement, missing dimensions, documentation, scope decisions), explained findings with dispositions, QC summary |

Plus: dashboard with search/filter/sort, final review and combined ZIP export, JSON backup/restore, interactive tutorials for all five modules, PWA offline support.

> ⚠️ Use fictional or otherwise authorised data only. FieldShield stores data in the browser on one device and is **not** an employer-approved records system. It makes **no** coverage, approval, settlement or repair decisions and has **no** Xactimate integration. See [docs/DATA_AND_SECURITY.md](docs/DATA_AND_SECURITY.md).

## Quick start

Requirements: Node.js 20+ (tested with Node 22) and npm.

```bash
npm install          # install dependencies
npm run dev          # development server at http://localhost:5173
```

Production build (includes the offline service worker):

```bash
npm run build        # outputs to dist/
npm run preview      # serves dist/ at http://localhost:4173
```

`dist/` is a static site — host it on any static web server over **HTTPS** (required for camera access and offline mode on phones). On a phone, open the site and use the browser’s “Add to Home Screen / Install app” to use it like an app.

Then: open the app → **Load fictional demo** to explore every module with seeded data, or **New inspection** to start from scratch. Tutorials are under **Help** (❓ icon).

## Tests

```bash
npm test             # 44 unit/integration tests (Vitest + fake IndexedDB)
npm run typecheck    # TypeScript strict type check
npm run test:e2e     # Playwright end-to-end tests on desktop and phone (Pixel 7) viewports
```

The end-to-end suite builds the app, then drives a real browser through the complete workflow (definition of done), the seeded demo, offline use, backup/restore, and the tutorial overlay.

## Deliverables in this repository

| Deliverable | Location |
|---|---|
| Working application & source | `src/` (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) |
| Fictional demonstration inspection | “Load fictional demo” button; data in `src/services/demo.ts` |
| Sample inspection report | `samples/sample-inspection-report.pdf` |
| Sample measurement worksheet | `samples/sample-measurement-worksheet.pdf` / `.csv` |
| Sample photo index | `samples/sample-photo-index.pdf` |
| Sample estimate QC summary | `samples/sample-qc-summary.pdf` / `samples/sample-qc-findings.csv` |
| Sample combined review package | `samples/sample-review-package.zip` |
| Sample estimate CSV for import | `samples/sample-estimate.csv` |
| Automated tests | `tests/unit`, `tests/e2e` |
| Manual acceptance checklist | [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) |
| Assumptions, limitations, unsupported integrations | [docs/LIMITATIONS.md](docs/LIMITATIONS.md) |
| Data storage, exports and dependencies | [docs/DATA_AND_SECURITY.md](docs/DATA_AND_SECURITY.md) |
| Roadmap | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Implementation status report | [docs/STATUS.md](docs/STATUS.md) |

Samples are regenerated from the demo inspection with `npx playwright test samples --project=desktop`.

## Project structure

```
src/
  domain/      Shared data model (zod schemas, types, IDs)
  services/    Business logic: measurement engine, checklists, validation, report generator,
               estimate QC rules, CSV import, photos, exports (PDF/CSV/ZIP/backup), demo data
  data/        Repository interfaces + IndexedDB implementation (offline storage)
  state/       App store (in-memory + immediate persistence), demo loader
  components/  Shell, navigation, shared UI, observation form
  modules/     Dashboard + the five modules + export, settings, help
  tutorial/    Interactive tutorial engine and step definitions
  styles/      Design tokens and responsive CSS
tests/unit     Vitest unit & integration tests
tests/e2e      Playwright end-to-end tests
docs/          Architecture, acceptance checklist, limitations, data & security, roadmap, status
samples/       Generated sample outputs from the fictional demo
```
