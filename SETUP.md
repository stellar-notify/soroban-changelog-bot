# Setup

## 1. Add this action to a contract repo

Copy `.github/workflows/example-consumer-workflow.yml` into `.github/workflows/` in the repo that
deploys your Soroban contract. Adjust the tag pattern (`v*.*.*`) or swap the trigger for
`workflow_run` if you deploy via a separate workflow — see the comment at the top of that file.

## 2. Configure inputs

| Input | Required | Notes |
|---|---|---|
| `rpc-url` | yes | e.g. `https://soroban-testnet.stellar.org` for testnet, or your mainnet RPC provider |
| `contract-name` | yes | Human-readable name used in the release title and LLM prompt |
| `previous-contract-id` | yes | `C...` address of the prior deployment |
| `new-contract-id` | yes | `C...` address of the new deployment |
| `previous-tag` | yes | Git tag/version label for the prior deployment |
| `new-tag` | no | Defaults to the tag that triggered the workflow |
| `github-token` | yes | Usually `${{ secrets.GITHUB_TOKEN }}` — needs `contents: write` permission on the job |
| `anthropic-api-key` | no | Omit to use the deterministic template renderer instead of an LLM call |

Recommended: store each tag's contract address as a repo variable (`Settings → Secrets and variables →
Actions → Variables`), named e.g. `CONTRACT_ID_v1.0.0`. The example workflow reads these via
`vars[format('CONTRACT_ID_{0}', <tag>)]` so you never have to edit the workflow file when you deploy
again — just add the new variable before pushing the tag.

If you'd rather not maintain repo variables, a `deployments.json` committed to the repo (tag → contract
id) that a workflow step `jq`s into `$GITHUB_OUTPUT` works just as well.

## 3. Secrets

- `GITHUB_TOKEN` is provided automatically by Actions; just make sure the job has
  `permissions: contents: write` (see the example workflow).
- `ANTHROPIC_API_KEY`, if you want LLM-generated prose: `Settings → Secrets and variables → Actions →
  Secrets → New repository secret`.

## 4. First run

The very first tagged release has no "previous" deployment to diff against — either skip the action for
that tag, or point `previous-contract-id` at the same address as `new-contract-id` (the diff will come
back empty and the changelog will note "no changes detected" in every section, which is correct).

## 5. Verify

Push a tag. Check the Actions tab for the run, then check the Releases page for the generated body. If
`anthropic-api-key` wasn't set, compare the output shape against
[`demo/sample-generated-changelog.md`](./demo/sample-generated-changelog.md) — same renderer, same four
headers.

---

# Issue backlog

The diff-to-changelog pipeline (WASM fetch → interface decode → structural diff → changelog render →
release upsert) is the part that had to be correct and well-tested before anything else, and it is: 22
passing tests in `__tests__/`, run against real XDR-encoded fixture WASM in CI. The following are scoped
follow-ups, roughly in the order they'd get picked up. Paste each block below as a separate GitHub issue.

### Issue 1: Detect and flag removed public functions as breaking (interface-diff hardening)
The core removed-function case is already handled (`function-removed` → `breaking`). This issue is about
the edges: functions whose *visibility* effectively changes without disappearing from the spec (e.g. a
function that starts panicking unconditionally, which the interface diff can't see since it only reads
`contractspecv0`, not function bodies). Scope: document this known limitation clearly in the README, and
investigate whether a lightweight heuristic (e.g. diffing exported function *count* in the WASM export
section vs. spec entries) can catch spec/export mismatches as a sanity check.

### Issue 2: Add Slack/Discord webhook notification support
Add optional `slack-webhook-url` / `discord-webhook-url` inputs. On successful release upsert, post a
condensed version of the changelog (headline + change counts per category, link to the full release) to
the configured webhook(s). Should reuse the same `Change[]` structured diff already computed — no new
diff logic needed, just a formatter per platform. Explicitly out of scope until the core pipeline
(this repo's current state) has been running reliably against at least one real release.

### Issue 3: Support multi-contract monorepo releases
Currently one action invocation diffs exactly one contract (one previous/new address pair). Many Soroban
projects deploy several contracts from one repo (e.g. a token + a router + a factory) and tag them
together. Scope: accept a JSON array input (`contracts: [{name, previousId, newId}, ...]`), run the
existing diff pipeline per contract, and either create one release per contract or one combined release
with a sub-section per contract — needs a design decision, worth discussing in the issue before
implementing.

### Issue 4: Add semantic version auto-bumping based on change severity
Given the structured diff this action already computes, infer a suggested next version: any `breaking`
change → major bump, any `notable`-only diff → minor, empty diff → patch/no bump. Output it as a new
`suggested-version` action output; don't auto-tag anything (that's a separate, riskier feature) — just
surface the suggestion so a maintainer can act on it, e.g. in a PR comment.

### Issue 5: Generate migration guide links for storage migrations
When `Storage Migrations Needed` is non-empty, this action currently only *describes* the migration
concern in prose. This issue is about linking out to (or, if paired with a separate migration-assistant
tool/idea, generating) a concrete migration guide — e.g. a template `migrate()` function skeleton for the
specific storage type that changed shape, based on the `before`/`after` struct or enum diff already
available in `Change.detail`. Needs a decision on whether guide generation belongs in this repo or a
companion tool this action links to.

### Issue 6: Improve LLM prompt with historical release context
Right now each changelog is generated from a single before/after diff with no awareness of prior
releases. Scope: optionally pass the last N release bodies as additional context to the LLM prompt so it
can reference an established pattern (e.g. "as in v1.2.0, this migration also requires...") and keep
terminology consistent release over release. Should remain opt-in and degrade gracefully with no prior
releases (first-ever run).
