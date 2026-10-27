// Moves the issues of a finished deploy on the board OSCT (users/mandymozart/projects/5) – called by
// board-status.yml through actions/github-script (#11, agents/RULES.md "Every session starts with its issue").
//
// Every `Fixes #N` (or closes / resolves) in the deployed commits → Status "Review on staging" (staging deploy) or
// "Deployed" (production deploy), plus one comment with the version. Only forward: an issue that is already as far
// or further (Deployed, Done) is left alone. `Refs #N` is a step, not a finished issue – it moves nothing.
//
// The deployed commits = from the previous counted run of the same deploy workflow on the same branch up to this one.
// A run counts when it succeeded and did not skip its "Deploy" step (the Kamal staging deploy skips while staging has
// no SSH_HOST – then the FTPS upload is the deploy that counts). No previous run → the last 30 commits.
const { execFileSync } = require('node:child_process');

const PROJECT_NUMBER = 5;
const ORDER = ['Backlog', 'Proposals', 'In progress', 'Review on staging', 'Deployed', 'Done'];
const FIXES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gi;
const SITES = {
  staging: { status: 'Review on staging', name: 'staging', url: 'https://osct.porschuetz.de' },
  production: { status: 'Deployed', name: 'production', url: 'https://osct.buildingfictions.com' },
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();

module.exports = async ({ github, context, core, getOctokit }) => {
  const run = context.payload.workflow_run;
  const { owner, repo } = context.repo;
  const site = SITES[run.path.includes('production') ? 'production' : 'staging'];

  const skippedDeploy = async (r) => {
    const { data } = await github.rest.actions.listJobsForWorkflowRun({ owner, repo, run_id: r.id, filter: 'latest' });
    return data.jobs.some((j) => (j.steps || []).some((s) => s.name === 'Deploy' && s.conclusion === 'skipped'));
  };
  if (await skippedDeploy(run)) {
    core.notice(`${run.name}: the Deploy step was skipped – nothing was deployed, the board stays.`);
    return;
  }

  // The previous counted run of this workflow on this branch: its commit is where this deploy starts
  const { data: prev } = await github.rest.actions.listWorkflowRuns({
    owner, repo, workflow_id: run.workflow_id, branch: run.head_branch, status: 'success', per_page: 30,
  });
  let base = null;
  for (const r of prev.workflow_runs) {
    if (r.id === run.id || new Date(r.created_at) >= new Date(run.created_at)) continue;
    if (!(await skippedDeploy(r))) { base = r.head_sha; break; }
  }
  let range = ['-n', '30', run.head_sha];
  if (base) {
    try {
      git('merge-base', '--is-ancestor', base, run.head_sha);
      range = [`${base}..${run.head_sha}`];
    } catch {
      core.info(`${base.slice(0, 7)} (previous deploy) is not an ancestor of ${run.head_sha.slice(0, 7)} – using the last 30 commits.`);
    }
  }

  const numbers = [...new Set([...git('log', '--format=%B', ...range).matchAll(FIXES)].map((m) => Number(m[1])))];
  core.info(`Deployed to ${site.name}: ${range.join(' ')} → ${numbers.length ? numbers.map((n) => `#${n}`).join(' ') : 'no Fixes #N'}`);
  if (!numbers.length) return;

  if (!process.env.PROJECT_TOKEN) {
    core.notice(`PROJECT_TOKEN is not set – ${numbers.map((n) => `#${n}`).join(' ')} not moved to "${site.status}" (docs/deploy.md "Board").`);
    return;
  }
  const board = getOctokit(process.env.PROJECT_TOKEN);

  const { user } = await board.graphql(`
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
          field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
        }
      }
    }`, { login: owner, number: PROJECT_NUMBER });
  const project = user.projectV2;
  const option = project.field.options.find((o) => o.name === site.status);
  if (!option) throw new Error(`the board has no status "${site.status}"`);

  let version = '';
  try { version = JSON.parse(git('show', `${run.head_sha}:client/package.json`)).version; } catch {}
  const sha = run.head_sha.slice(0, 7);
  const moved = [];

  for (const n of numbers) {
    let issue;
    try {
      ({ repository: { issue } } = await board.graphql(`
        query($owner: String!, $repo: String!, $n: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $n) {
              id state
              projectItems(first: 20) {
                nodes {
                  id project { id }
                  status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
                }
              }
            }
          }
        }`, { owner, repo, n }));
    } catch {
      core.info(`#${n} is not an issue of ${owner}/${repo} – skipped.`);
      continue;
    }
    // On develop nothing closes an issue; a closed one was finished by hand – leave it
    if (site.name === 'staging' && issue.state !== 'OPEN') { core.info(`#${n} is closed – skipped.`); continue; }

    let item = issue.projectItems.nodes.find((i) => i.project.id === project.id);
    const current = item?.status?.name ?? '';
    if (ORDER.indexOf(current) >= ORDER.indexOf(site.status)) {
      core.info(`#${n} is already "${current}" – stays.`);
      continue;
    }
    if (!item) {
      const { addProjectV2ItemById } = await board.graphql(`
        mutation($project: ID!, $content: ID!) {
          addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
        }`, { project: project.id, content: issue.id });
      item = addProjectV2ItemById.item;
    }
    await board.graphql(`
      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) {
          projectV2Item { id }
        }
      }`, { project: project.id, item: item.id, field: project.field.id, option: option.id });

    const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${run.id}`;
    const body = site.name === 'staging'
      ? `Deployed to staging (${site.url})${version ? ` in **${version}**` : ''} – ${sha}, [deploy](${runUrl}). ` +
        `Status → **Review on staging**: check it there.`
      : `Live on production (${site.url})${version ? ` in **${version}**` : ''} – ${sha}, [deploy](${runUrl}). ` +
        `Status → **Deployed**; Done is Tilman's once he has checked it.`;
    await github.rest.issues.createComment({ owner, repo, issue_number: n, body });
    moved.push(`#${n} ${current || 'no status'} → ${site.status}`);
  }

  core.info(moved.length ? moved.join('\n') : 'Nothing to move.');
  await core.summary.addHeading(`Board after the ${site.name} deploy`, 3)
    .addRaw(moved.length ? moved.join('<br>') : 'Nothing to move.').write();
};
