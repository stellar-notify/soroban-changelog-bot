/**
 * Generates fixtures/v1.wasm and fixtures/v2.wasm: minimal, syntactically
 * valid (but not executable) WASM modules whose only meaningful content is
 * a real "contractspecv0" custom section, XDR-encoded exactly the way
 * soroban-sdk's `#[contract]` / `#[contracttype]` macros do at compile
 * time. This lets the diff pipeline be tested end-to-end (WASM parsing ->
 * spec decoding -> interface diff) without needing a Rust/wasm32 toolchain
 * in CI.
 *
 * v2 intentionally introduces, relative to v1:
 *  - a new function `pause` (New Feature)
 *  - a removed function `legacy_withdraw` (Breaking Change)
 *  - a changed return type on `balance` (Breaking Change)
 *  - a reshaped `DataKey` enum, gaining a variant + changing a discriminant
 *    (Storage Migration Needed)
 *  - a removed error case on `ContractError` (Security-Relevant Change)
 */
const fs = require('fs');
const path = require('path');
const { xdr } = require('@stellar/stellar-sdk');

function u32Type() {
  return xdr.ScSpecTypeDef.scSpecTypeU32();
}
function boolType() {
  return xdr.ScSpecTypeDef.scSpecTypeBool();
}
function addressType() {
  return xdr.ScSpecTypeDef.scSpecTypeAddress();
}
function i128Type() {
  return xdr.ScSpecTypeDef.scSpecTypeI128();
}

function fn(name, inputs, outputs) {
  return xdr.ScSpecEntry.scSpecEntryFunctionV0(
    new xdr.ScSpecFunctionV0({
      doc: '',
      name,
      inputs: inputs.map(([n, t]) => new xdr.ScSpecFunctionInputV0({ doc: '', name: n, type: t })),
      outputs,
    }),
  );
}

function enumEntry(name, cases) {
  return xdr.ScSpecEntry.scSpecEntryUdtEnumV0(
    new xdr.ScSpecUdtEnumV0({
      doc: '',
      lib: '',
      name,
      cases: cases.map(([n, v]) => new xdr.ScSpecUdtEnumCaseV0({ doc: '', name: n, value: v })),
    }),
  );
}

function errorEnumEntry(name, cases) {
  return xdr.ScSpecEntry.scSpecEntryUdtErrorEnumV0(
    new xdr.ScSpecUdtErrorEnumV0({
      doc: '',
      lib: '',
      name,
      cases: cases.map(([n, v]) => new xdr.ScSpecUdtErrorEnumCaseV0({ doc: '', name: n, value: v })),
    }),
  );
}

const v1Entries = [
  fn('initialize', [['admin', addressType()]], []),
  fn('balance', [['id', addressType()]], [u32Type()]),
  fn('transfer', [['from', addressType()], ['to', addressType()], ['amount', i128Type()]], [boolType()]),
  fn('legacy_withdraw', [['id', addressType()], ['amount', i128Type()]], [boolType()]),
  enumEntry('DataKey', [
    ['Admin', 0],
    ['Balance', 1],
  ]),
  errorEnumEntry('ContractError', [
    ['NotAuthorized', 1],
    ['InsufficientBalance', 2],
  ]),
];

const v2Entries = [
  fn('initialize', [['admin', addressType()]], []),
  fn('balance', [['id', addressType()]], [i128Type()]), // breaking: u32 -> i128
  fn('transfer', [['from', addressType()], ['to', addressType()], ['amount', i128Type()]], [boolType()]),
  fn('pause', [['admin', addressType()]], [boolType()]), // new feature
  enumEntry('DataKey', [
    ['Admin', 0],
    ['Balance', 2], // discriminant changed 1 -> 2 (storage migration)
    ['Paused', 3], // new variant
  ]),
  errorEnumEntry('ContractError', [
    ['NotAuthorized', 1],
    // InsufficientBalance removed (security-relevant)
    ['ContractPaused', 3],
  ]),
];

function buildSpecSection(entries) {
  return Buffer.concat(entries.map((e) => e.toXDR()));
}

function uleb128(n) {
  const bytes = [];
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (n !== 0);
  return Buffer.from(bytes);
}

function customSection(name, payload) {
  const nameBuf = Buffer.from(name, 'utf8');
  const inner = Buffer.concat([uleb128(nameBuf.length), nameBuf, payload]);
  return Buffer.concat([Buffer.from([0x00]), uleb128(inner.length), inner]);
}

function buildMinimalWasm(specEntries) {
  const magic = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
  const version = Buffer.from([0x01, 0x00, 0x00, 0x00]);
  const specSection = customSection('contractspecv0', buildSpecSection(specEntries));
  return Buffer.concat([magic, version, specSection]);
}

const fixturesDir = path.join(__dirname, '..', 'fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });
fs.writeFileSync(path.join(fixturesDir, 'v1.wasm'), buildMinimalWasm(v1Entries));
fs.writeFileSync(path.join(fixturesDir, 'v2.wasm'), buildMinimalWasm(v2Entries));
console.log('Wrote fixtures/v1.wasm and fixtures/v2.wasm');
