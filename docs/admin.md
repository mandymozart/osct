# Admin: the instance's users and roles at /editor/admin

A small admin page inside the editor app (`editor/src/routes/admin/`, served at `/editor/admin` – the same build and
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

- **Users** – search by a part of the e-mail address (`GET /api/admin/users?q=`), newest first, up to 50 at a time
  (narrow the search for more). Each row: the address (`pw` when a password is set), the **roles as toggles**
  (`reader` is fixed – every account has it; `editor` and `admin` grant / revoke with one click; hovering a role
  shows when and by whom it was granted: `signup`, `migration`, `config` for the `EDITORS` / `ADMINS` lists, `secret`
  for the admin secret, or the granting admin's address), the language, the **update options** the reader opted into
  (plain text, read-only: the ones that are on of book, artist, publisher, else `–`), sign-up and last-seen dates. A
  role that is on shows pressed; the notice reports a grant or revoke only when the role really changed.
- **Editors** / **Admins** – the filter buttons show the users with that role (the editors shortcut).
- **Newsletter** – the filter shows the users with any update option on; **Newsletter CSV** downloads them
  (`GET /api/admin/users.csv?newsletter=1`: `email, language, bookUpdates, artistUpdates, publisherUpdates, createdAt`)
  for the mailing tool. With the filter *All*, the button is **Users CSV** and downloads every user; under *Editors* or
  *Admins* there is no CSV button (#206 – `editor/src/lib/users-csv.ts`). The API also narrows to one option
  (`?option=bookUpdates`), which the page does not offer yet.
- **Invite an editor** – an address becomes an editor at once (`POST /api/admin/editors`); a new address is created as
  an account that signs in with a code by e-mail, like every reader.
- An admin may give up their own admin role (after a confirm), unless they are the **last admin** (409 `last-admin`):
  make another admin first. A revoked role is gone at the user's next request; their own roles reload on the page.

The reader's preferences stay where they are (Info → Account): the page shows them, it does not change them. The
update options are the only opt-in fields the accounts have – there is no separate newsletter flag (the newsletter
list = any option on).

## Where the code lives

```
editor/src/routes/admin/+page.svelte   the page (search, roles, CSV, invite)
editor/src/routes/+layout.svelte       the gate: admin routes need admin, everything else editor
editor/src/lib/api.ts                  listRoles, listUsers, grantRole, revokeRole, inviteEditor, downloadUsersCsv
editor/src/lib/session.svelte.ts       isEditor / isAdmin from GET /user `roles`
server/api/src/Roles.php               the roles (tables roles, user_roles), grant / revoke, the configured lists
server/api/src/Admin.php               the admin endpoints and who may call them (admin by session or X-Admin-Secret)
```

The API is described in [server, "Admin API"](server.md#admin-api); the tests are the sections *roles, admin* of
`php server/tests/api-test.php`.
