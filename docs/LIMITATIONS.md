# Assumptions, limitations and unsupported integrations

## Unsupported integrations (not implemented)

- **Xactimate** — no integration of any kind. Quantities are presented for review and manual entry. Estimate data enters FieldShield only by manual typing or CSV import.
- **Carrier / State Farm systems** — none. No claim-system lookup, upload or sync.
- **Cloud sync, accounts, multi-device, sharing** — none, by design for this version.
- **AI services** — none. “Suggestions” are simple local rules (file name keywords, current area, missing photo types).
- **Aerial / satellite roof measurement imports** — not supported.

## Functional limitations

- **Excel files** (`.xlsx`) are not parsed; save as CSV first.
- **EXIF** metadata (GPS, original capture time) is not read. Capture time comes from the file’s modified date. HEIC images only work in browsers that can decode them (e.g. Safari); otherwise convert to JPEG.
- **Camera capture** uses the browser’s file input with `capture="environment"`; it opens the native camera on phones. Live in-app camera preview is not implemented.
- **Dictation** depends on browser support (Chrome, Edge, Safari); Firefox does not support it. The button is disabled where unsupported.
- **Roof geometry** supports rectangle, triangle and trapezoid planes. Complex shapes must be split into these. Pitch is whole numbers 0–24/12. Linear features are entered as totals per segment; drawing/sketching is not supported.
- **Irregular rooms** use added/subtracted rectangles; wall area requires an entered perimeter. Sloped/vaulted ceilings are not modelled.
- **Estimate QC compatibility** is keyword- and unit-based (e.g. “shingle” + SQ/SF → roof area; “paint wall” + SF → room adjusted wall). Lines that don’t match a rule are not compared with measurements. Tolerances: roof area −2% to +(largest waste scenario + 1%); linear roof features −5%/+10%; interior −10%/+10%. These are review prompts, not standards.
- **Report generator** organises recorded text; it does not paraphrase or write prose. Professional wording is the user’s responsibility via section editing.
- **PDF fonts** use the built-in Helvetica set; uncommon characters are replaced (e.g. “→” becomes “->”).
- **Storage limits** depend on the browser (often a share of free disk). Large photo sets can fill it; the app reports quota errors and shows usage in Settings. Very large backups (hundreds of photos) may be slow to create on older phones.
- **Single user, single device.** Two browser tabs editing the same inspection at once may overwrite each other’s changes (last write wins).
- **Accessibility**: keyboard navigation, focus styles, ARIA roles/labels and large touch targets are implemented; a formal WCAG audit and screen-reader testing on real devices have not been done.
- **Real-device testing**: automated tests run in Chromium at desktop and Pixel 7 sizes. Testing on physical iPhone/Android/tablet hardware, Safari and Firefox remains a manual step (see the acceptance checklist).

## Assumptions

- 1 roofing square = 100 sq ft. Pitch factor = √(1 + (rise/12)²). Roof plane dimensions default to “along the slope”; choosing “plan” applies the pitch factor.
- Ceiling area equals floor area. Gross wall = perimeter × ceiling height; adjusted wall = gross − entered openings.
- Arithmetic tolerance is $0.01.
- Checklist templates are suggestions; nothing is mandatory unless the user marks it required.
- The demo inspection, its photos and estimate are entirely fictional and contain deliberately seeded problems.
