import * as fs from 'fs';
import { interfaceFromWasm } from '../src/contract-spec';
import { diffInterfaces } from '../src/interface-diff';
import { renderChangelogWithoutLlm } from '../src/changelog-llm';

const v1 = interfaceFromWasm(fs.readFileSync('fixtures/v1.wasm'));
const v2 = interfaceFromWasm(fs.readFileSync('fixtures/v2.wasm'));
const diff = diffInterfaces(v1, v2);
const body = renderChangelogWithoutLlm({
  contractName: 'SampleToken',
  previousTag: 'v1.0.0',
  newTag: 'v1.1.0',
  previousContractId: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4G',
  newContractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  changes: diff.changes,
});
console.log(body);
