# Prioritised roadmap

Ordered by value to field users and by dependency. Items that move data off the device are deliberately last and gated on approvals.

## P1 — Near term (no new external dependencies)

1. **Physical-device acceptance testing** on iPhone (Safari), Android (Chrome) and a tablet; fix any device-specific issues.
2. **EXIF reading** (capture time, orientation, optional GPS) for imported photos.
3. **Photo compression option** to reduce storage use, while still preserving the untouched original when chosen.
4. **Report wording templates**: user-defined boilerplate snippets inserted into sections (still user-approved).
5. **Custom QC rule configuration**: editable keyword → measurement mappings and tolerances in Settings.
6. **Multi-tab safety**: detect concurrent edits of the same inspection (BroadcastChannel) and warn.

## P2 — Medium term

7. **Roof sketch tool**: draw planes on a grid to derive dimensions and linear features.
8. **Excel (.xlsx) import** via a vetted parser.
9. **Moisture-reading log** (location, reading, material, meter) for water losses, linked to rooms.
10. **Accessibility audit** (WCAG 2.2 AA) with screen-reader testing.
11. **Localisation** and additional unit formats.
12. **Encrypted backups** (passphrase-protected export files).

## P3 — Requires employer approval, security review and authorisation

13. **Authentication + authorised backend** implementing the existing `DataStore` interface, with end-to-end encryption and audit logging.
14. **Sync / multi-device** with conflict resolution.
15. **Approved integrations** (e.g. estimating platforms or claim systems) only through officially supported, authorised APIs.
16. **Optional on-device AI assistance** (e.g. caption drafts) — only with explicit approval, never sending data to third parties by default.
