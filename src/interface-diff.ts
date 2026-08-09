import { ContractInterface, FunctionSpec, StructSpec, UnionSpec, EnumSpec, ErrorEnumSpec } from './contract-spec';

export type ChangeSeverity = 'breaking' | 'notable' | 'info';

export interface Change {
  kind: string;
  severity: ChangeSeverity;
  summary: string;
  detail?: string;
}

export interface InterfaceDiff {
  changes: Change[];
}

function arrEq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function diffFunctions(before: Record<string, FunctionSpec>, after: Record<string, FunctionSpec>, changes: Change[]) {
  for (const name of Object.keys(before)) {
    if (!(name in after)) {
      changes.push({
        kind: 'function-removed',
        severity: 'breaking',
        summary: `Public function \`${name}\` was removed`,
        detail: `Previous signature: ${name}(${before[name].inputs.map((i) => `${i.name}: ${i.type}`).join(', ')}) -> ${before[name].outputs.join(', ') || 'void'}`,
      });
    }
  }
  for (const name of Object.keys(after)) {
    if (!(name in before)) {
      changes.push({
        kind: 'function-added',
        severity: 'notable',
        summary: `Public function \`${name}\` was added`,
        detail: `${name}(${after[name].inputs.map((i) => `${i.name}: ${i.type}`).join(', ')}) -> ${after[name].outputs.join(', ') || 'void'}`,
      });
      continue;
    }
    const b = before[name];
    const a = after[name];

    const bTypes = b.inputs.map((i) => i.type);
    const aTypes = a.inputs.map((i) => i.type);
    if (b.inputs.length > a.inputs.length || !aTypes.slice(0, bTypes.length).every((t, i) => t === bTypes[i])) {
      changes.push({
        kind: 'function-signature-changed',
        severity: 'breaking',
        summary: `Parameters of \`${name}\` changed in an incompatible way`,
        detail: `Before: (${b.inputs.map((i) => `${i.name}: ${i.type}`).join(', ')})\nAfter: (${a.inputs.map((i) => `${i.name}: ${i.type}`).join(', ')})`,
      });
    } else if (a.inputs.length > b.inputs.length) {
      changes.push({
        kind: 'function-params-added',
        severity: 'notable',
        summary: `\`${name}\` gained additional parameter(s)`,
        detail: `Before: (${b.inputs.map((i) => `${i.name}: ${i.type}`).join(', ')})\nAfter: (${a.inputs.map((i) => `${i.name}: ${i.type}`).join(', ')})`,
      });
    }

    if (!arrEq(b.outputs, a.outputs)) {
      changes.push({
        kind: 'function-return-changed',
        severity: 'breaking',
        summary: `Return type of \`${name}\` changed`,
        detail: `Before: ${b.outputs.join(', ') || 'void'}\nAfter: ${a.outputs.join(', ') || 'void'}`,
      });
    }
  }
}

function diffStructs(before: Record<string, StructSpec>, after: Record<string, StructSpec>, changes: Change[]) {
  for (const name of Object.keys(before)) {
    if (!(name in after)) {
      changes.push({
        kind: 'struct-removed',
        severity: 'breaking',
        summary: `Type \`${name}\` was removed`,
      });
      continue;
    }
    const b = before[name];
    const a = after[name];
    const bFieldNames = b.fields.map((f) => f.name);
    const aFieldNames = a.fields.map((f) => f.name);

    const removedFields = b.fields.filter((f) => !aFieldNames.includes(f.name));
    const addedFields = a.fields.filter((f) => !bFieldNames.includes(f.name));
    const retypedFields = b.fields.filter((bf) => {
      const af = a.fields.find((f) => f.name === bf.name);
      return af && af.type !== bf.type;
    });

    if (removedFields.length > 0 || retypedFields.length > 0) {
      changes.push({
        kind: 'struct-field-breaking',
        severity: 'breaking',
        summary: `Struct \`${name}\` changed shape in an incompatible way`,
        detail: [
          removedFields.length ? `Removed fields: ${removedFields.map((f) => f.name).join(', ')}` : '',
          retypedFields.length
            ? `Retyped fields: ${retypedFields.map((f) => `${f.name} (${f.type} -> ${a.fields.find((af) => af.name === f.name)!.type})`).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } else if (addedFields.length > 0) {
      changes.push({
        kind: 'struct-field-added',
        severity: 'notable',
        summary: `Struct \`${name}\` gained new field(s): ${addedFields.map((f) => f.name).join(', ')}`,
      });
    }
  }
  for (const name of Object.keys(after)) {
    if (!(name in before)) {
      changes.push({
        kind: 'struct-added',
        severity: 'notable',
        summary: `New type \`${name}\` was added`,
      });
    }
  }
}

function diffUnions(before: Record<string, UnionSpec>, after: Record<string, UnionSpec>, changes: Change[]) {
  for (const name of Object.keys(before)) {
    if (!(name in after)) {
      changes.push({ kind: 'union-removed', severity: 'breaking', summary: `Union type \`${name}\` was removed` });
      continue;
    }
    const bCases = before[name].cases.map((c) => c.name);
    const aCases = after[name].cases.map((c) => c.name);
    const removed = bCases.filter((c) => !aCases.includes(c));
    const added = aCases.filter((c) => !bCases.includes(c));
    if (removed.length > 0) {
      changes.push({
        kind: 'union-case-removed',
        severity: 'breaking',
        summary: `Union \`${name}\` lost case(s): ${removed.join(', ')}`,
      });
    }
    if (added.length > 0) {
      changes.push({
        kind: 'union-case-added',
        severity: 'notable',
        summary: `Union \`${name}\` gained case(s): ${added.join(', ')}`,
      });
    }
  }
  for (const name of Object.keys(after)) {
    if (!(name in before)) {
      changes.push({ kind: 'union-added', severity: 'notable', summary: `New union type \`${name}\` was added` });
    }
  }
}

function diffEnums(before: Record<string, EnumSpec>, after: Record<string, EnumSpec>, changes: Change[]) {
  for (const name of Object.keys(before)) {
    if (!(name in after)) {
      changes.push({ kind: 'enum-removed', severity: 'breaking', summary: `Enum \`${name}\` was removed` });
      continue;
    }
    const b = before[name];
    const a = after[name];
    for (const bc of b.cases) {
      const ac = a.cases.find((c) => c.name === bc.name);
      if (!ac) {
        changes.push({
          kind: 'enum-case-removed',
          severity: 'breaking',
          summary: `Enum \`${name}\` lost case \`${bc.name}\``,
        });
      } else if (ac.value !== bc.value) {
        changes.push({
          kind: 'enum-value-changed',
          severity: 'breaking',
          summary: `Enum \`${name}\` case \`${bc.name}\` changed discriminant value (${bc.value} -> ${ac.value}) — this is a storage-incompatible change if this enum is used as a storage key or value`,
        });
      }
    }
    const newCases = a.cases.filter((c) => !b.cases.some((bc) => bc.name === c.name));
    if (newCases.length > 0) {
      changes.push({
        kind: 'enum-case-added',
        severity: 'notable',
        summary: `Enum \`${name}\` gained case(s): ${newCases.map((c) => c.name).join(', ')}`,
      });
    }
  }
}

function diffErrorEnums(before: Record<string, ErrorEnumSpec>, after: Record<string, ErrorEnumSpec>, changes: Change[]) {
  for (const name of Object.keys(before)) {
    if (!(name in after)) continue;
    const b = before[name];
    const a = after[name];
    for (const bc of b.cases) {
      const ac = a.cases.find((c) => c.name === bc.name);
      if (!ac) {
        changes.push({
          kind: 'error-case-removed',
          severity: 'breaking',
          summary: `Error \`${name}::${bc.name}\` was removed — callers matching on this error code will break`,
        });
      } else if (ac.value !== bc.value) {
        changes.push({
          kind: 'error-value-changed',
          severity: 'breaking',
          summary: `Error \`${name}::${bc.name}\` changed its numeric code (${bc.value} -> ${ac.value})`,
        });
      }
    }
  }
}

/**
 * A struct or enum whose name suggests it is used as a Soroban storage key
 * or value (the conventions soroban-sdk projects overwhelmingly follow:
 * "DataKey", "StorageKey", "*Key" enums, and "*State"/"*Config" value
 * structs). We flag changes to these separately as storage migrations,
 * since a WASM upgrade to a live contract does NOT migrate existing ledger
 * entries — a changed key encoding or value shape orphans old data.
 */
const STORAGE_LIKE_NAME = /(key|state|config|storage)$/i;

export function findStorageMigrationSignals(before: ContractInterface, after: ContractInterface): Change[] {
  const signals: Change[] = [];
  const allBeforeTypes = { ...before.structs, ...before.enums, ...before.unions };
  const allAfterTypes = { ...after.structs, ...after.enums, ...after.unions };

  for (const name of Object.keys(allBeforeTypes)) {
    if (!STORAGE_LIKE_NAME.test(name)) continue;
    if (!(name in allAfterTypes)) {
      signals.push({
        kind: 'storage-type-removed',
        severity: 'breaking',
        summary: `Storage-related type \`${name}\` no longer exists`,
        detail: 'Any ledger entries keyed or shaped by this type from before the upgrade are now unreadable by the new WASM unless a migration function reads and rewrites them.',
      });
      continue;
    }
    const before_ = JSON.stringify(allBeforeTypes[name]);
    const after_ = JSON.stringify(allAfterTypes[name]);
    if (before_ !== after_) {
      signals.push({
        kind: 'storage-type-changed',
        severity: 'breaking',
        summary: `Storage-related type \`${name}\` changed shape`,
        detail: 'Existing ledger entries were written with the old shape. Confirm a migration path exists (e.g. a versioned enum variant or an explicit migrate() admin function) before this upgrade is applied to a contract with live state.',
      });
    }
  }

  return signals;
}

export function diffInterfaces(before: ContractInterface, after: ContractInterface): InterfaceDiff {
  const changes: Change[] = [];
  diffFunctions(before.functions, after.functions, changes);
  diffStructs(before.structs, after.structs, changes);
  diffUnions(before.unions, after.unions, changes);
  diffEnums(before.enums, after.enums, changes);
  diffErrorEnums(before.errorEnums, after.errorEnums, changes);
  changes.push(...findStorageMigrationSignals(before, after));
  return { changes };
}
