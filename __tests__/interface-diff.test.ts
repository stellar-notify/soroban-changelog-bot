import * as fs from 'fs';
import * as path from 'path';
import { interfaceFromWasm } from '../src/contract-spec';
import { diffInterfaces } from '../src/interface-diff';

const v1 = interfaceFromWasm(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'v1.wasm')));
const v2 = interfaceFromWasm(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'v2.wasm')));

describe('diffInterfaces (v1 -> v2 fixture)', () => {
  const { changes } = diffInterfaces(v1, v2);

  it('flags the removed function as breaking', () => {
    const c = changes.find((c) => c.kind === 'function-removed');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('breaking');
    expect(c!.summary).toMatch(/legacy_withdraw/);
  });

  it('flags the new function as notable, not breaking', () => {
    const c = changes.find((c) => c.kind === 'function-added');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('notable');
    expect(c!.summary).toMatch(/pause/);
  });

  it('flags the changed return type on balance as breaking', () => {
    const c = changes.find((c) => c.kind === 'function-return-changed');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('breaking');
    expect(c!.summary).toMatch(/balance/);
  });

  it('flags the removed error case as a distinct change', () => {
    const c = changes.find((c) => c.kind === 'error-case-removed');
    expect(c).toBeDefined();
    expect(c!.summary).toMatch(/InsufficientBalance/);
  });

  it('flags the DataKey enum discriminant change as breaking, storage-relevant', () => {
    const c = changes.find((c) => c.kind === 'enum-value-changed');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('breaking');
    expect(c!.summary).toMatch(/DataKey/);
    expect(c!.summary).toMatch(/Balance/);
  });

  it('surfaces the DataKey change again as a storage migration signal', () => {
    const c = changes.find((c) => c.kind === 'storage-type-changed');
    expect(c).toBeDefined();
    expect(c!.summary).toMatch(/DataKey/);
  });

  it('flags the new DataKey variant as notable', () => {
    const c = changes.find((c) => c.kind === 'enum-case-added');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('notable');
    expect(c!.summary).toMatch(/Paused/);
  });

  it('produces no changes when diffing a spec against itself', () => {
    const { changes: identical } = diffInterfaces(v1, v1);
    expect(identical).toEqual([]);
  });
});
