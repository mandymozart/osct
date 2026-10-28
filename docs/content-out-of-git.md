# Content out of git

> Temporary runbook: it ends when the content has left the repository and its history (#5). Delete it then.

The book content leaves this repository, history included (Tilman, 2026-10-28: "there will not be any content in
git", "aus dem Git … raus purgen, auch in der History, dass das Repository wieder klein und handelbar wird"). The
app loads the built content from the CDN ([content on the CDN](content-cdn.md)); the content source lives in a
folder of its own; CI and the tests build the small test fixture `fixtures/content/`.

The repository is **public**: everything in its history can be downloaded by anyone until it is rewritten – and on
GitHub for a while after (step 7).

## Where things are

| What | Where |
|---|---|
| Content source (book) | `C:\Development\osct\osct-content\content` (copied 2026-10-28 from the main checkout, develop, with its 16 local videos) – no history, no backup of its own yet |
| Placeholder content, full size | `C:\Development\osct\osct-content\content-demo` |
| Test fixture | `fixtures/content/` in the repository (916 KB, marked by `FIXTURE.md`) |
| Built content | the CDN: `<env>/<build>/` on the storage zone `osct` |

Each checkout names the source in `scripts/.env`:

```
OSCT_CONTENT_DIR=C:/Development/osct/osct-content/content
```

## Steps

Done in this repository (1.7.6, #5): the fixture, CI and the tests on the fixture, the content build reads only
`OSCT_CONTENT_DIR` (no fallback), `osct content sync` refuses the fixture, the workflow "Content" has no sync,
`content-demo/` replaced by the fixture.

1. **Deploys without content.** The app image and the FTPS staging deploy build with
   `VITE_CONTENT_BASE_URL: ${{ vars.CONTENT_BASE_URL }}`, and the `Dockerfile` drops `COPY content content` (Kamal
   session: `Dockerfile`, `.github/workflows/deploy*.yml`). Until then removing `content/` breaks every deploy.
2. **A home for the source that is backed up.** Decide where `osct-content` is kept safe – a private repository
   of its own, or a `source/` folder on the storage zone – before the history that holds the only other copy is
   rewritten.
3. **Remove `content/` from the tree** in a normal commit on `develop`:

   ```bash
   git rm -r --cached content
   echo "/content/" >> .gitignore
   ```

   Then release, so that `main` has the content-free tree too: `main` still carries the build output
   `client/public/assets/content/` from before 2026-09-28. Afterwards no branch tip may hold anything the rewrite
   removes (checked in step 5).
4. **Freeze and tidy.** Merge or drop the open branches – on 2026-10-28: `build-content-in-ci`, `compilation`,
   `claude/laughing-wright-hrt8zy`, `claude/heuristic-varahamihira-4faefe` – and their pull requests. Nobody
   pushes until step 6 is done. Every branch that survives is rewritten too; work that is not pushed is lost to it.
5. **Rewrite a fresh mirror clone** (never a working checkout). Keep a backup first – it holds the whole content
   history, keep it off GitHub:

   ```bash
   git clone --mirror https://github.com/mandymozart/osct.git osct-backup.git
   git clone --mirror https://github.com/mandymozart/osct.git osct.git
   cd osct.git
   git config core.longpaths true
   for r in develop main; do git ls-tree -r --name-only refs/heads/$r > ../$r-before.txt; done
   git filter-repo --invert-paths \
     --path content/ --path content-demo/ \
     --path videos/ --path beta/ --path images/ --path targets/ --path .mindar/ --path src/targets/ \
     --path public/assets/images/ --path public/assets/videos/ --path public/assets/targets/ \
     --path client/public/assets/content/ --path client/public/assets/images/ \
     --path client/public/assets/targets/ --path client/src/targets/
   for r in develop main; do git ls-tree -r --name-only refs/heads/$r | diff ../$r-before.txt - && echo "$r unchanged"; done
   git log --all --oneline -- content content-demo | head   # empty
   git count-objects -vH                                   # size-pack ≈ 28 MiB
   ```

   The paths: the book content and the placeholder content, and the content of earlier layouts (page images,
   videos, compiled MindAR targets, the beta prototype, the committed build output). `git filter-repo` is the
   tool the git project recommends (`pip install git-filter-repo`). On Windows the repack after the rewrite fails
   in a deep folder ("Filename too long") – `core.longpaths` or a short path avoids it; the history is rewritten
   either way, then `git gc --prune=now --aggressive` finishes it.
6. **Force push** (Tilman). filter-repo removes the remote on purpose:

   ```bash
   git remote add origin https://github.com/mandymozart/osct.git
   git push --force origin 'refs/heads/*' 'refs/tags/*'
   ```

   Not `--mirror`: GitHub refuses the `refs/pull/*` refs. Branch protection of `main` / `develop` may need to allow
   the force push for the moment.
7. **Afterwards.**
   - Every checkout and worktree is cloned again – an old clone that pushes or merges brings the whole history
     back. Delete the old worktrees.
   - Every commit id changes: links to commits in issues and pull requests point to the old history.
   - GitHub keeps the old commits reachable through the pull request refs and cached views, and the size it shows
     stays, until GitHub Support removes them (request: remove cached views / run garbage collection after a
     history rewrite). For a public repository that is the step that takes the content off GitHub.

## Tried on 2026-10-28

On a fresh mirror clone of `mandymozart/osct` (all branches, 9 tags, 345 commits), with git-filter-repo 2.47:

| | Pack |
|---|---|
| before | 192.8 MiB |
| after (`content/`, `content-demo/` only) | 57.9 MiB |
| after (all paths above) | 28.4 MiB, 342 commits |

`develop` lost only `content/` (102 files); `main` lost `content/` and the build output
`client/public/assets/content/` (108 files) – which is why step 3 comes first. The rest of the 28 MiB is mostly
`agents/reference/` (design PDF and frames) and the app's own assets.
