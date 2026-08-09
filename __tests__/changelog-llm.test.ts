import * as fs from 'fs';
import * as path from 'path';
import { interfaceFromWasm } from '../src/contract-spec';
import { diffInterfaces } from '../src/interface-diff';
import { renderChangelogWithoutLlm, generateChangelog } from '../src/changelog-llm';

const v1 = interfaceFromWasm(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'v1.wasm')));
const v2 = interfaceFromWasm(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'v2.wasm')));
const { changes } = diffInterfaces(v1, v2);

const baseInput = {
  contractName: 'SampleToken',
  previousTag: 'v1.0.0',
  newTag: 'v1.1.0',
  previousContractId: 'CPREV000000000000000000000000000000000000000000000000000',
  newContractId: 'CNEW0000000000000000000000000000000000000000000000000000',
  changes,
};

describe('renderChangelogWithoutLlm', () => {
  const body = renderChangelogWithoutLlm(baseInput);

  it('includes all four required section headers in order', () => {
    const headers = ['## Breaking Changes', '## New Features', '## Security-Relevant Changes', '## Storage Migrations Needed'];
    let lastIndex = -1;
    for (const h of headers) {
      const idx = body.indexOf(h);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('puts the removed function under Breaking Changes', () => {
    const section = body.split('## New Features')[0];
    expect(section).toMatch(/legacy_withdraw/);
  });

  it('puts the new function under New Features', () => {
    const section = body.split('## New Features')[1].split('## Security-Relevant Changes')[0];
    expect(section).toMatch(/pause/);
  });

  it('puts the storage-tagged DataKey change under Storage Migrations Needed, not Breaking Changes', () => {
    const storageSection = body.split('## Storage Migrations Needed')[1];
    const breakingSection = body.split('## Breaking Changes')[1].split('## New Features')[0];
    expect(storageSection).toMatch(/DataKey/);
    expect(breakingSection).not.toMatch(/storage-type-changed|Storage-related type/);
  });

  it('writes a friendly empty-state message when a section has nothing to report', () => {
    const emptyBody = renderChangelogWithoutLlm({ ...baseInput, changes: [] });
    expect(emptyBody).toMatch(/No breaking changes detected/);
    expect(emptyBody).toMatch(/No new features detected/);
    expect(emptyBody).toMatch(/No security-relevant changes detected/);
    expect(emptyBody).toMatch(/No storage schema changes detected/);
  });
});

describe('generateChangelog', () => {
  it('falls back to the deterministic renderer when no API key is provided', async () => {
    const body = await generateChangelog(baseInput, undefined);
    expect(body).toEqual(renderChangelogWithoutLlm(baseInput));
  });
});
