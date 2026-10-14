# Deployment and change control

FieldShield is hosted on **Netlify** as a static site at **https://field-shield.netlify.app/**. There is no server or database — Netlify only serves the app files.

## How changes reach the live site

```
push to develop ──► Checks workflow (type check, unit, build, e2e) ──all pass──► `verified` moves to that commit
                                                                                         │
                         every night 8:00 pm Pacific (8:30 pm backstop) ◄────────────────┘
                         promote.yml: build + audit, then fast-forward main to verified
                                                                                         │
                                                         Netlify builds `main` ──► live site
```

- Work is pushed to `develop` only.
- `verified` is always the newest `develop` commit on which every check passed. A commit whose tests failed or are still running waits.
- `main` is changed only by `promote.yml`, at 8 pm Pacific, and only by fast-forward. If `main` ever has a commit `verified` lacks,
  promotion stops and GitHub emails the repository owner.
- GitHub cron runs in UTC; the workflow is scheduled at several UTC times aimed at 8:05 pm Pacific (with backstops) and each run
  checks the actual Pacific time, so it stays at 8 pm year-round through daylight-saving changes. GitHub sometimes delays or skips
  scheduled runs, so a run that starts any time from 8:00 to 9:59 pm Pacific may promote; the first one does the job.
- To see what tonight will ship: `git fetch` then `git log --oneline origin/main..origin/verified`.
- To promote immediately (exceptional): GitHub → Actions → “Nightly promotion (verified to main)” → Run workflow.
- This is a convention enforced by the workflows, not by GitHub branch protection (not available on free private repositories).
  Anyone with push access could still push to `main`; don't.

## Connecting Netlify (one time)

1. Sign in at https://app.netlify.com (same account as CodeHound).
2. **Add new site → Import an existing project → GitHub →** choose `SpectreRSG/FieldShield`.
   (If it isn't listed, choose “Configure the Netlify app on GitHub” and give it access to FieldShield.)
3. Netlify reads `netlify.toml` automatically: build command `npm run build`, publish directory `dist`, Node 22.
   Set **Branch to deploy: `main`**. Click **Deploy**.
4. Site configuration → Build & deploy → Branches and deploy contexts: set **Branch deploys** to *None* and
   **Deploy previews** to *Any pull request* or *None* (your choice), so only `main` goes live.
5. Optional: Site configuration → Change site name → e.g. `fieldshield` → the address becomes `https://fieldshield.netlify.app`.

The site needs HTTPS (Netlify provides it) for the camera, offline mode and “Add to Home Screen”.

## Security headers
`netlify.toml` sets a strict Content-Security-Policy (no outside hosts at all), HSTS, frame blocking and a Permissions-Policy
that allows only the app's own use of the microphone (optional dictation) and camera.
