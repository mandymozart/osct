# Trigger tests

Runs of the trigger trial (debug overlay → **trial**, `docs/content.md` "Trigger test protocol") with the printed
triggers, one file per run. Since 1.7.8 the trial holds the current spread only (±0), so a miss is down to the
engine, the camera and the print, not to background work.

The marked printout photos and the app's own `md` report of each run are kept outside git, next to the delivery:
`osct-incoming-content/trials/<date>-<device>/`.

## Runs

| Date | Device | Browser | App | Printout | Found | Not found | Not tested | Not on printout |
|---|---|---|---|---|---|---|---|---|
| 2026-10-28 | Samsung Galaxy S22 | Chromium 155 (Android) | 1.7.8 | A3 packed, 121 of 131 | 96 | 25 | 0 | 10 |
| planned | iPhone 7 | Safari | | | | | | |

Details: [2026-10-28 Galaxy S22](2026-10-28-galaxy-s22.md).

## Not found, per device

The triggers on the printout that a run did not find. ✗ not found, ✓ found, – not tested.

| Page | Target | Printed size | S22 | iPhone 7 |
|---|---|---|---|---|
| 9 | p009-1 | 37 × 21 mm | ✗ | |
| 13 | p013-1 | 39 × 22 mm | ✗ | |
| 13 | p013-2 | 27 × 30 mm | ✗ | |
| 17 | p017-1 | 21 × 30 mm | ✗ | |
| 39 | p039-1 | 37 × 20 mm | ✗ | |
| 41 | p041-1 | 26 × 42 mm | ✓ (retest) | |
| 42 | p042-1 | 37 × 22 mm | ✗ | |
| 50 | p050-1 | 39 × 25 mm | ✗ | |
| 67 | p067-1 | 26 × 21 mm | ✗ | |
| 95 | p095-1 | 20 × 26 mm | ✗ | |
| 96 | p096-1 | 23 × 30 mm | ✗ | |
| 96 | p096-2 | 25 × 25 mm | ✗ | |
| 101 | p101-1 | 36 × 30 mm | ✗ | |
| 105 | p105-1 | 34 × 28 mm | ✗ | |
| 123 | p123-1 | 16 × 20 mm | ✗ (retest) | |
| 129 | p129-1 | 26 × 26 mm | ✗ | |
| 153 | p153-1 | 33 × 21 mm | ✗ | |
| 163 | p163-1 | 35 × 24 mm | ✗ | |
| 167 | p167-1 | 34 × 19 mm | ✗ | |
| 173 | p173-1 | 36 × 24 mm | ✗ | |
| 176 | p176-1 | 30 × 24 mm | ✗ | |
| 186 | p186-1 | 20 × 30 mm | ✗ | |
| 194 | p194-1 | 26 × 28 mm | ✗ | |
| 206 | p206-2 | 22 × 39 mm | ✗ | |
| 213 | p213-2 | 20 × 26 mm | ✗ | |
| 215 | p215-1 | 23 × 47 mm | ✗ | |

## Not on the printout

Delivered as print images but missing from `All_Triggers.pdf`, so the printout does not have them (open question to
Kévin, issue #14): p002-1, p030-2, p034-1, p035-1, p095-2, p100-1, p106-1, p158-1, p192-1, p222-2.
Checked against the book previews: all ten are in the book on their page and genuinely missing from the PDF, not
leftover data.

Report for the designers (guidelines for trigger images, with examples): `osct-incoming-content/trials/report-2026-10-28/OSCT-trigger-test-report-2026-10-28.pdf`.
