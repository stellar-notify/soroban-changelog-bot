# Demo: real testnet deployment pair

Wave Stellar acceptance requires this action demonstrated against **two real testnet deployments** of
a sample contract, with the actual generated release note shown. This repo ships everything needed to
run the pipeline end-to-end; the two live deployments still have to happen on your side, since I don't
have a Rust/wasm32 toolchain or testnet RPC access in this environment. Here's the fastest path that
still respects a browser-only workflow (no local CLI required):

## 1. Get two versions of a sample contract built and deployed

Fastest: use [Stellar Laboratory](https://lab.stellar.org) (fully browser-based) or the
`soroban-cli`/`stellar-cli` "build & deploy" flow through a GitHub Actions runner if you'd rather not
touch a terminal at all — a `workflow_dispatch` job running on `ubuntu-latest` with the Rust toolchain
and `stellar-cli` installed can build and deploy for you; trigger it from the Actions tab on your phone
or the github.dev web UI, same as your other Soroban projects.

Any tiny `#[contract]` crate works. The simplest option that maps directly onto the diff categories
this action is built to detect:

- **v1**: functions `initialize`, `balance`, `transfer`, `legacy_withdraw`; a `DataKey` enum used for
  storage; a `ContractError` error enum.
- **v2**: remove `legacy_withdraw`, change `balance`'s return type, add a `pause` function, add a
  `DataKey::Paused` variant, and remove one `ContractError` case.

This is exactly the shape of `fixtures/v1.wasm` / `fixtures/v2.wasm` in this repo (see
`scripts/generate-fixtures.js` for the precise interface), so if you build a Rust contract matching that
shape, the release note you get back should closely match `demo/sample-generated-changelog.md`.

Deploy v1, tag the repo `v1.0.0`. Make your changes, deploy v2, tag `v2.0.0`. Record both contract
addresses (`C...`).

## 2. Wire up the workflow

Copy `.github/workflows/example-consumer-workflow.yml` into the sample contract's repo, and set repo
variables `CONTRACT_ID_v1.0.0` and `CONTRACT_ID_v2.0.0` to the two addresses from step 1 (Settings →
Secrets and variables → Actions → Variables — all clickable from the GitHub web UI).

Push the `v2.0.0` tag (or re-push it / re-run the workflow) to trigger the action.

## 3. Capture the result

The action creates/updates a GitHub Release on the `v2.0.0` tag. Screenshot or link that Release page —
that's your acceptance evidence. `demo/sample-generated-changelog.md` in this repo is the same pipeline
run locally against the fixture WASM pair (deterministic renderer, no API key), as a preview of what to
expect before you do the real testnet run.

## Why the fixtures are trustworthy stand-ins

`fixtures/v1.wasm` and `fixtures/v2.wasm` are not toy JSON — they're syntactically valid WASM modules
carrying a real `contractspecv0` custom section, XDR-encoded with the exact same `xdr.ScSpecEntry`
writers that `soroban-sdk`'s contract macros use at compile time (see
`scripts/generate-fixtures.js`). The parsing, diffing, and changelog-rendering code has no idea it isn't
looking at a real deployment's WASM. The only thing the fixtures can't stand in for is the actual RPC
fetch (`src/rpc-client.ts`), which is a thin, already-tested-by-inspection wrapper around
`@stellar/stellar-sdk`'s `Server.getContractWasmByContractId`.
