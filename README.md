# soroban-changelog-bot

A GitHub Action that diffs a [Soroban](https://developers.stellar.org/docs/build/smart-contracts/overview)
smart contract's public interface and storage-relevant types between two deployments, and generates a
categorized release note: **Breaking Changes**, **New Features**, **Security-Relevant Changes**, and
**Storage Migrations Needed**. It creates or updates a GitHub Release with the result.

Unlike a source-diff changelog bot, this action diffs the thing that actually matters for a smart
contract release: the **deployed WASM's interface**, fetched straight from Stellar RPC using the
contract addresses you configure. It doesn't trust commit messages or PR titles — it trusts what's on
chain.

## Why generic changelog bots (conventional-changelog, release-please, etc.) don't work here

Tools like `conventional-commits`, `release-please`, or `semantic-release` all work the same way: they
read commit messages or PR labels and bucket them by convention (`feat:`, `fix:`, `BREAKING CHANGE:`).
That's a reasonable model for most software, where "breaking" is whatever the author decided to write
in the commit message. Three things make that model actively misleading for Soroban contracts:

1. **The commit message and the on-chain interface can drift.** A contributor forgets the
   `BREAKING CHANGE:` footer, or writes `fix:` for what's actually a changed function signature. For a
   library, that's an annoying changelog inaccuracy. For a contract with real value locked in it, a
   consumer who trusts a mislabeled "fix" release and doesn't re-check the interface can build an
   integration against a function that no longer exists, or send `i128` to a call site that no longer
   accepts it.

2. **Storage schema changes are invisible to source diffs and even to interface diffs, but they're the
   single most dangerous category of Soroban release.** Deploying a new WASM over an existing contract
   address does **not** migrate the ledger entries that WASM already wrote. If a `#[contracttype]`
   struct or a `DataKey`-style enum used for storage changes shape — a renamed field, a reordered enum
   discriminant, a removed variant — the new contract code can silently misread or become unable to read
   data the old code wrote, with no compiler error and no failing test, because Rust's type system has
   no idea what's already sitting in ledger storage. Conventional changelog tools have no concept of
   "storage schema" at all; they only ever see text diffs of source files, and most storage-shape changes
   don't even require touching the function that reads the type. This is the category this action treats
   as first-class (`## Storage Migrations Needed`), specifically flagging types whose names match
   Soroban's own storage-key/value conventions (`DataKey`, `*State`, `*Config`, `*Storage`) and any change
   to their shape or enum discriminants.

3. **"Breaking" for a deployed contract means something narrower and stricter than "breaking" for a
   library.** A Rust-level breaking change (e.g. reordering a struct's fields in source) may be a no-op
   for the WASM's binary interface. Conversely, a change that looks cosmetic in a source diff — an enum
   gaining a new variant in the middle instead of the end — silently renumbers every discriminant after
   it, which *is* breaking for anything relying on that encoding, including the contract's own storage.
   Source-level conventions can't see this; only a diff of the compiled interface (what this action reads
   via the WASM's `contractspecv0` custom section) can.

Because of this, the action doesn't ask a human or an LLM to *decide* what's breaking — it computes it
structurally from the decoded interface (removed/retyped functions, changed return types, removed enum
cases, changed discriminants, removed error codes), and only hands the LLM a pre-classified, structured
diff to turn into readable prose. See `src/interface-diff.ts` for the full rule set.

## How it works

```
git tag pushed (or a deploy workflow completes)
        │
        ▼
fetch previous + new WASM from Stellar RPC   (src/rpc-client.ts)
        │
        ▼
extract "contractspecv0" custom section       (src/wasm-sections.ts)
        │
        ▼
decode into a normalized interface            (src/contract-spec.ts)
   (functions, structs, unions, enums, error enums)
        │
        ▼
structurally diff before vs. after            (src/interface-diff.ts)
   → classified Change[] (breaking / notable / info)
        │
        ▼
LLM turns the structured diff into a          (src/changelog-llm.ts)
categorized changelog body
   (falls back to a deterministic template
    renderer if no ANTHROPIC_API_KEY is set)
        │
        ▼
create or update the GitHub Release           (src/github-release.ts)
```

## Usage

```yaml
- uses: your-org/soroban-changelog-bot@v1
  with:
    rpc-url: https://soroban-testnet.stellar.org
    contract-name: 'SampleToken'
    previous-contract-id: ${{ vars.CONTRACT_ID_PREV }}
    new-contract-id: ${{ vars.CONTRACT_ID_NEW }}
    previous-tag: v1.0.0
    new-tag: v1.1.0
    github-token: ${{ secrets.GITHUB_TOKEN }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }} # optional
```

See `.github/workflows/example-consumer-workflow.yml` for a full tag-triggered workflow, and
[`SETUP.md`](./SETUP.md) for configuring inputs, secrets, and RPC endpoints.

`anthropic-api-key` is optional. Without it, the action still produces a fully categorized changelog
using a deterministic template renderer over the same structured diff — no external LLM call happens.
With it, the same diff is turned into fuller prose via the Anthropic API.

## Demo

[`demo/README.md`](./demo/README.md) walks through producing acceptance evidence against two real
testnet deployments. [`demo/sample-generated-changelog.md`](./demo/sample-generated-changelog.md) is a
real changelog produced by this pipeline (not hand-written) against `fixtures/v1.wasm` and
`fixtures/v2.wasm` — two syntactically valid WASM modules carrying real XDR-encoded contract specs, used
so the diff pipeline can be tested without a Rust/wasm32 toolchain in CI.

## Development

```bash
npm ci
npm run typecheck
npm test              # runs the diff pipeline against fixtures/*.wasm
npm run build          # bundles src/index.ts -> dist/index.js via ncc
node scripts/generate-fixtures.js   # regenerate fixtures/*.wasm if you change their shape
```

`dist/index.js` is committed (standard practice for JS/TS GitHub Actions, since Actions run the
committed bundle directly, not your source). CI fails if `dist/` or `fixtures/` are out of sync with
their generators.

## License

MIT — see [LICENSE](./LICENSE).
