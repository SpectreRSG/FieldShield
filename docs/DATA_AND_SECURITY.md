# Data storage, exports and security boundaries

## Where information is stored

| Data | Location |
|---|---|
| Inspections (all text, measurements, checklists, reports, estimate, findings, history) | Browser IndexedDB database `fieldshield`, store `inspections` |
| Photos (originals, thumbnails, annotated copies) | IndexedDB store `blobs` |
| Settings, tutorial progress | IndexedDB stores `settings`, `tutorials` |
| Unsent note drafts, last-opened inspection | Browser `localStorage` (keys starting `fs-`) |
| Application code (for offline use) | Service-worker cache |

Everything is on the one device and browser where it was entered. Nothing is synchronised. Clearing site data, uninstalling the browser, private/incognito mode, or browser storage eviction can erase it. Settings → “Ask browser to protect data” requests persistent storage (the browser decides). **Local browser storage is not a substitute for an employer-approved records-management system.**

## What FieldShield sends over the network

- **Nothing**, by default. There is no backend, account, analytics, telemetry or AI service.
- The app shell is downloaded from wherever you host `dist/` (and cached for offline use).
- **Optional dictation** uses the browser’s Web Speech API. In some browsers (e.g. Chrome) audio is processed by the browser vendor’s servers. It is disabled until the user enables it after a disclosure prompt, and can be turned off in Settings.

## What an export contains

| Export | Contents |
|---|---|
| Review package (`.zip`) | `README.txt`, `report.pdf` (latest version; “DRAFT” watermark unless final-reviewed), `measurement-worksheet.pdf/.csv`, `photo-index.pdf/.csv`, `qc-summary.pdf`, `qc-findings.csv`, `photos/originals/*`, `photos/annotated/*`, `inspection-data.json` (full structured record, without embedded images) |
| Report PDF | Report sections, damage table, consistency issues at generation, photographs with captions |
| Measurement worksheet | Every dimension as entered, formula, result, value source; roof summary and waste scenarios |
| Photo index | Numbered table + images with area, shot type, caption, version |
| QC summary | Counts, confirmed arithmetic errors, potential concerns with explanations, dispositions, estimate lines |
| Backup (`.json`) | All selected inspections plus every photo as embedded data URLs; restorable via Settings |

Exports are files on the device. Store and share them only through approved systems.

## External dependencies

Runtime (bundled into the app, no network calls): React, React Router, zod, idb, jsPDF (+ its optional html2canvas/DOMPurify chunks, unused), jspdf-autotable, PapaParse, JSZip, Workbox runtime. No CDN, fonts or third-party scripts are loaded at runtime.

## Security notes

- No secrets or API keys exist in the code.
- No inspection data is written to the console or logs (one validation warning logs only a record ID).
- Data is not encrypted at rest beyond whatever the device/OS provides. Use device encryption and a screen lock.
- There is no authentication: anyone with access to the unlocked device and browser profile can see the data.
- No connection to State Farm or any carrier system exists or is attempted.

## Before entering real claim information

Verify with your employer: approval to use this tool, data-retention requirements, required security controls (device management, encryption, authentication), whether dictation may be used, and where exports may be stored. Until then, use only fictional data such as the built-in demo.
