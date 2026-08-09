import * as fs from 'fs';
import * as path from 'path';
import { interfaceFromWasm } from '../src/contract-spec';
import { extractCustomSections } from '../src/wasm-sections';

const v1 = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'v1.wasm'));
const v2 = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'v2.wasm'));

describe('extractCustomSections', () => {
  it('finds the contractspecv0 section in a fixture WASM', () => {
    const sections = extractCustomSections(v1);
    expect(sections['contractspecv0']).toBeDefined();
    expect(sections['contractspecv0'].length).toBeGreaterThan(0);
  });

  it('throws on non-WASM input', () => {
    expect(() => extractCustomSections(Buffer.from('not wasm'))).toThrow(/magic/i);
  });
});

describe('interfaceFromWasm', () => {
  it('decodes all functions from v1', () => {
    const iface = interfaceFromWasm(v1);
    expect(Object.keys(iface.functions).sort()).toEqual(
      ['balance', 'initialize', 'legacy_withdraw', 'transfer'].sort(),
    );
  });

  it('decodes function parameter names and types', () => {
    const iface = interfaceFromWasm(v1);
    expect(iface.functions.transfer.inputs).toEqual([
      { name: 'from', type: 'Address' },
      { name: 'to', type: 'Address' },
      { name: 'amount', type: 'I128' },
    ]);
  });

  it('decodes enums with their discriminant values', () => {
    const iface = interfaceFromWasm(v1);
    expect(iface.enums.DataKey.cases).toEqual([
      { name: 'Admin', value: 0 },
      { name: 'Balance', value: 1 },
    ]);
  });

  it('decodes error enums', () => {
    const iface = interfaceFromWasm(v1);
    expect(Object.keys(iface.errorEnums)).toEqual(['ContractError']);
    expect(iface.errorEnums.ContractError.cases.map((c) => c.name)).toEqual([
      'NotAuthorized',
      'InsufficientBalance',
    ]);
  });

  it('decodes the v2 fixture differently from v1 (sanity check they are not identical)', () => {
    const a = interfaceFromWasm(v1);
    const b = interfaceFromWasm(v2);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
    expect(Object.keys(b.functions)).toContain('pause');
    expect(Object.keys(b.functions)).not.toContain('legacy_withdraw');
  });

  it('throws a helpful error for a WASM with no contractspecv0 section', () => {
    const magic = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    expect(() => interfaceFromWasm(magic)).toThrow(/contractspecv0/);
  });
});
