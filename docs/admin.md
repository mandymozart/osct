# Admin: the instance's users and roles, and the QR codes' arrivals, at /editor/admin

A small admin page inside the editor app (`editor/src/routes/(app)/admin/`, served at `/editor/admin` – the same build and
the same `.htaccess` fallback as the editor, so both deploys serve it without new infrastructure; the editor app owns
everything under its base `/editor`, a root `/admin` would be a second app). **`/admin`** is the short address: the
site's `.htaccess` redirects it to `/editor/admin/`. It is for the instance's admin – decided with Tilman on
2026-10-29 (issue #65): own and small, a feature set of the white-label core (`agents/STRATEGY.md`), modelled on
SCUTOONS' roles so the two can be unified later ([server, "Roles"](server.md#roles)).

## Who may use it

An account with the role **`admin`** ([server, "Roles"](server.md#roles)). The first admins of an instance come
from the deployment: the addresses in the GitHub environment variable **`ADMINS`** (comma-separated; `staging` and
`production`, written into the API's config by both deploys like `EDITORS`, [deploy](deploy.md#configuration)) get the
role when they sign in. Every further admin or editor is made on the page. Signing in works like the editor and the
reader: a code by e-mail, or the account's password. An admin who is no editor sees only this page; an editor who is
no admin sees "No admin access" at `/editor/admin`.

## What it does

- **QR codes and links** (#324, on top) – how many people came to the app from each printed QR code or link with
  `?s=<source>` ([server, "Arrivals"](server.md#arrivals)): the book's code `bk1` (last page), the desktop landing
  page's `lp1`, and any other source as soon as it is used (*Unknown source*). Per source: the arrivals in the chosen
  window (7 / 30 / 90 days, a year) and in all, the **first** arrivals (browsers that had never arrived before), phone ·
  tablet · desktop, the first and the last day, and a bar per day. **A new code** (#326) composes the address for a new
  source and where it leads – the start, Info, a scene, an entry list or an entry (the reader's links) –, e.g.
  `…/entry/p4-1?s=fl1`, and draws it as a **QR code in SVG** to copy or download for print (`editor/src/lib/qr-svg.ts`,
  the reader's QR library copied to `editor/static/vendor/qrcode.js`). Counts only – no IP, no user.
- **Users** – search by a part of the e-mail address (`GET /api/admin/users?q=`), newest first, up to 50 at a time
  (narrow the search for more). Each row: the address (`pw` when a password is set), the **roles as toggles**
  (`reader` is fixed – every account has it; `editor` and `admin` grant / revoke with one click; hovering a role
  shows when and by whom it was granted: `signup`, `migration`, `config` for the `EDITORS` / `ADMINS` lists, `secret`
  for the admin secret, or the granting admin's address), the language, the **updates** column – whether the reader opted into
  news from Building Fictions, the one update option since #325 (plain text, read-only: *Building Fictions* or `–`), sign-up and last-seen dates. A
  role that is on shows pressed; the notice reports a grant or revoke only when the role really changed.
- **Editors** / **Admins** – the filter buttons show the users with that role (the editors shortcut).
- **Newsletter** – the filter shows the users with the update option on; **Newsletter CSV** downloads them
  (`GET /api/admin/users.csv?newsletter=1`: `email, language, buildingfictions, createdAt`)
  for the mailing tool. With the filter *All*, the button is **Users CSV** and downloads every user; under *Editors* or
  *Admins* there is no CSV button (#206 – `editor/src/lib/users-csv.ts`). The API also takes
  `?option=buildingfictions` (the same list while there is one option).
- **Invite an editor** – an address becomes an editor at once (`POST /api/admin/editors`); a new address is created as
  an account that signs in with a code by e-mail, like every reader.
- An admin may give up their own admin role (after a confirm), unless they are the **last admin** (409 `last-admin`):
  make another admin first. A revoked role is gone at the user's next request; their own roles reload on the page.
- **Ids without leading zeros (#63)** (at the bottom, one-off) – renames the database's zero-padded ids (`s004-005` →
  `s4-5`, `p004-1` → `p4-1`) through `POST /api/admin/rename-ids` ([server](server.md#ids-without-leading-zeros-63)),
  for a host without a shell. **Dry run** shows per experience how many ids, the rows per table, a sample and any
  collision, and the plugin code that names a padded id; **Apply** is enabled only after a dry run with ids to rename and
  no collision, and asks first – readers' progress starts over (`editor/src/lib/RenameIdsSection.svelte`).

The reader's preferences stay where they are (Info → Account): the page shows them, it does not change them. The
update option (`buildingfictions`, news from Building Fictions – #325 merged the earlier three: experience, artist,
publisher) is the only opt-in field the accounts have – there is no separate newsletter flag (the newsletter list =
the option on).

## Where the code lives

```
editor/src/routes/(app)/admin/+page.svelte   the page (search, roles, CSV, invite)
editor/src/lib/ArrivalsSection.svelte        QR codes and links: the arrivals by source (#324)
editor/src/routes/(app)/+layout.svelte       the gate: admin routes need admin, everything else editor
editor/src/lib/api.ts                        listRoles, listUsers, grantRole, revokeRole, inviteEditor, downloadUsersCsv
editor/src/lib/session.svelte.ts             isEditor / isAdmin from GET /user `roles`
server/api/src/Roles.php                     the roles (tables roles, user_roles), grant / revoke, the configured lists
server/api/src/Admin.php                     the admin endpoints and who may call them (admin by session or X-Admin-Secret)
server/api/src/Arrivals.php                  POST /arrivals and GET /admin/arrivals (#324)
```

The API is described in [server, "Admin API"](server.md#admin-api); the tests are the sections *roles, admin* of
`php server/tests/api-test.php`.
