# FieldShield — working rules

## Branches and releases (same model as CodeHound, promotion at 8 pm Pacific)
- **Push work only to `develop`** (or a feature branch merged into `develop`). Never push to `main` or `verified` by hand.
- `.github/workflows/checks.yml` runs type check, unit tests, build and Playwright end-to-end tests on every push. When all pass on
  `develop`, it fast-forwards the branch `verified` to that commit.
- `.github/workflows/promote.yml` fast-forwards `main` to `verified` **every night at 8 pm Pacific** (with an 8:30 pm backstop).
  Netlify builds and publishes only `main`. So changes go live at 8 pm Pacific, never during the day.
- Fast-forward only: no merge commits into `main`, no rebases or force pushes of `main`/`verified`/`develop`.
- Pull requests target `develop`, not `main`.
- Details: `docs/DEPLOYMENT.md`.

## Before pushing
Run `npm run typecheck`, `npm test`, and for UI changes `npm run test:e2e`. Keep `npm audit --omit=dev --audit-level=high` clean —
the nightly promotion refuses to ship if it fails.

## Product boundaries
Fictional/authorised data only; no coverage/approval/settlement decisions; no Xactimate integration; no network calls with
inspection data. See `docs/LIMITATIONS.md` and `docs/DATA_AND_SECURITY.md`.
