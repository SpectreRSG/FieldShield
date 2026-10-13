# Manual acceptance checklist

Run on each target: **iPhone (Safari)**, **Android phone (Chrome)**, **tablet**, **desktop (Chrome/Edge/Firefox/Safari)**. Serve the production build over HTTPS (`npm run build`, then host `dist/`). Use fictional data only.

Mark each: ✅ pass · ❌ fail (note details) · N/A.

## A. Shell, brand, navigation
- [ ] Header shows the FieldShield shield logo and name; tagline “Inspect. Document. Verify.” on dashboard/help.
- [ ] Phone: bottom navigation with 6 large targets; desktop: left sidebar. Active module is highlighted in its colour.
- [ ] Save chip shows “Saving…/Saved …”; “Offline” chip appears with no connection.
- [ ] No horizontal scrolling of the page at 360 px width (tables scroll inside their panels).

## B. Inspection Mission Control
- [ ] Create an inspection; validation blocks a missing reference or loss type.
- [ ] Checklist generated for the chosen loss types; add a loss type later → new items added, progress kept.
- [ ] Set item statuses (incl. Not applicable, Needs follow-up → creates follow-up task); add/remove custom item; mark item required.
- [ ] Mark pre-inspection complete; departure review warns about open gaps.
- [ ] Add structures and areas (elevation, roof plane, room); edit photo checklist per area; add observation from an area card.
- [ ] Gaps tab lists missing photos/measurements/notes/reviews with working “Fix” links.
- [ ] Archive → hidden from dashboard (unless “Show archived”) → reopen. Delete asks for confirmation.
- [ ] History lists actions with times.

## C. Measurements
- [ ] Enter `12'6"`, `150in`, `3.8m`, `12.5` — all accepted; `abc` and `5'14"` rejected with a message.
- [ ] Rectangle 40×16 = 640 sq ft; triangle 30×14 = 210 sq ft; trapezoid (40+20)/2×10 = 300 sq ft.
- [ ] Plan dimensions + 12/12 pitch → ×1.414; missing pitch is reported.
- [ ] Incomplete plane excluded from total and listed. Waste scenarios add/remove; labelled as estimates.
- [ ] Room 14×12×8 with a 3'×6'8" door → adjusted wall 396 sq ft. Segments + perimeter for irregular room.
- [ ] Switch Settings → metric; results show m/m².
- [ ] Changing a recorded dimension adds a revision entry. Worksheet PDF/CSV download and open correctly.

## D. Photos
- [ ] “Take photo” opens the camera on phones; photo saved and appears with number.
- [ ] Import several photos; a non-image file shows an error without breaking others.
- [ ] Filing into an area assigns photos; suggested shot type shown as “Suggested” until accepted/ignored.
- [ ] Edit area, shot type, component, caption, labels; link/unlink observations.
- [ ] Annotate → new “Annotated copy” photo; the original is unchanged and downloadable.
- [ ] Coverage tab shows possibly missing overview/context/close-up; toggling requirements updates gaps.
- [ ] Photo index PDF/CSV; reordering changes numbers.

## E. Notes & report
- [ ] Add each note kind; reported statement asks “Reported by”.
- [ ] Dictation: prompt explains data handling; dictated text appended (supported browsers).
- [ ] Type a note, refresh the page → unsent text is restored.
- [ ] Consistency flags: contradiction, “caused by” in a direct observation, coverage language.
- [ ] Generate report: contains only recorded information; “Not recorded” where missing; damage table with photo numbers.
- [ ] Edit a section → “Edited by you”; change a measurement → “Regenerate (records changed)”; regenerate keeps the edit and flags changed source.
- [ ] Final review requires all sections approved; final version is locked; PDF has DRAFT watermark until final.

## F. Estimate QC
- [ ] Add/edit lines manually; total mismatch hint appears.
- [ ] Import `samples/sample-estimate.csv`; mapping auto-guessed; preview; replace vs append; `.xlsx` gives guidance.
- [ ] Run QC on the demo: 1 confirmed arithmetic error, duplicate, quantity discrepancies, missing dimensions, documentation and scope findings — each with an explanation.
- [ ] Set dispositions and notes; re-run keeps them; fixed issues show “No longer reproduced”.
- [ ] QC summary PDF/CSV.

## G. Workflow, export, data reliability
- [ ] Complete the full workflow on a new inspection; workflow tracker reaches 13/13.
- [ ] Final review records open items; combined ZIP contains all listed files and opens correctly.
- [ ] Close and reopen the browser/app → all data present; “Continue where you left off” works.
- [ ] Airplane mode after first load: app opens, create/edit inspection, add photos; reconnect → nothing lost.
- [ ] Backup all → delete inspection → restore → data and photos back. Damaged backup rejected with no changes.
- [ ] Settings shows storage usage and persistence status.

## H. Tutorials
- [ ] Each of the 5 tutorials starts from Help (demo loads if no inspection exists).
- [ ] Arrow and highlight point at the real control; rotate phone / resize window → they follow.
- [ ] Next, Back, Skip, Restart work; “Try it” steps advance when the real control is tapped.
- [ ] Highlighted and other controls remain usable during the tour.
- [ ] First visit to each module offers the tour; “No thanks” remembers the choice.

## I. Boundaries
- [ ] No screen states or implies coverage, approval, denial, settlement or definitive repair.
- [ ] No claim of Xactimate integration.
- [ ] Network inspector shows no requests carrying inspection data (dictation excepted when enabled).
