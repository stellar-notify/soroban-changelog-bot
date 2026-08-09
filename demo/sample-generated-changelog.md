# SampleToken v1.1.0

_Diffed against `v1.0.0` via the deterministic (no-LLM) renderer — this is the exact output of
`renderChangelogWithoutLlm()` run against `fixtures/v1.wasm` and `fixtures/v2.wasm`, reproducible with
`npx ts-node --files scripts/sample-run.ts`. With `anthropic-api-key` set, the LLM renderer produces
fuller prose from the same structured diff input; see `demo/README.md`._

## Breaking Changes
- Public function `legacy_withdraw` was removed
- Return type of `balance` changed
- Enum `DataKey` case `Balance` changed discriminant value (1 -> 2) — this is a storage-incompatible change if this enum is used as a storage key or value

## New Features
- Public function `pause` was added
- Enum `DataKey` gained case(s): Paused

## Security-Relevant Changes
- Error `ContractError::InsufficientBalance` was removed — callers matching on this error code will break

## Storage Migrations Needed
- Storage-related type `DataKey` changed shape
