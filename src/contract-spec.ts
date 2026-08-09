import { xdr } from '@stellar/stellar-sdk';
import { XdrReader } from '@stellar/js-xdr';
import { extractCustomSections } from './wasm-sections';

export interface FunctionParam {
  name: string;
  type: string;
}

export interface FunctionSpec {
  name: string;
  inputs: FunctionParam[];
  outputs: string[];
  docs: string;
}

export interface StructFieldSpec {
  name: string;
  type: string;
}

export interface StructSpec {
  name: string;
  fields: StructFieldSpec[];
  docs: string;
}

export interface EnumSpec {
  name: string;
  cases: { name: string; value: number }[];
  docs: string;
}

export interface UnionCaseSpec {
  name: string;
  kind: 'void' | 'tuple';
  types: string[];
}

export interface UnionSpec {
  name: string;
  cases: UnionCaseSpec[];
  docs: string;
}

export interface ErrorEnumSpec {
  name: string;
  cases: { name: string; value: number; docs: string }[];
}

/** Normalized, diff-friendly view of a contract's full public interface. */
export interface ContractInterface {
  functions: Record<string, FunctionSpec>;
  structs: Record<string, StructSpec>;
  unions: Record<string, UnionSpec>;
  enums: Record<string, EnumSpec>;
  errorEnums: Record<string, ErrorEnumSpec>;
}

function typeToString(t: xdr.ScSpecTypeDef): string {
  switch (t.switch().name) {
    case 'scSpecTypeUdt':
      return t.udt().name().toString();
    case 'scSpecTypeVec':
      return `Vec<${typeToString(t.vec().elementType())}>`;
    case 'scSpecTypeMap':
      return `Map<${typeToString(t.map().keyType())}, ${typeToString(t.map().valueType())}>`;
    case 'scSpecTypeOption':
      return `Option<${typeToString(t.option().valueType())}>`;
    case 'scSpecTypeResult':
      return `Result<${typeToString(t.result().okType())}, ${typeToString(t.result().errorType())}>`;
    case 'scSpecTypeTuple':
      return `(${t
        .tuple()
        .valueTypes()
        .map(typeToString)
        .join(', ')})`;
    case 'scSpecTypeBytesN':
      return `BytesN<${t.bytesN().n()}>`;
    default:
      // Primitive scalar types (U32, I64, Address, Symbol, Bool, etc.) - the
      // switch name itself (minus the "scSpecType" prefix) is the type name.
      return t.switch().name.replace(/^scSpecType/, '');
  }
}

function docsToString(docs: string | Buffer): string {
  return (typeof docs === 'string' ? docs : docs.toString('utf8')).trim();
}

/**
 * Reads a stream of concatenated SCSpecEntry XDR records (the exact layout
 * of the "contractspecv0" WASM custom section) into a normalized interface.
 */
export function decodeContractSpec(sectionBytes: Buffer): ContractInterface {
  const iface: ContractInterface = {
    functions: {},
    structs: {},
    unions: {},
    enums: {},
    errorEnums: {},
  };

  // `.read(reader)` is a static method generated at runtime by js-xdr for
  // every composite XDR type, used to read one entry at a time off a shared
  // cursor - but it isn't part of stellar-sdk's published type declarations,
  // hence the cast.
  const ScSpecEntryReadable = xdr.ScSpecEntry as unknown as { read(reader: XdrReader): xdr.ScSpecEntry };
  const reader = new XdrReader(sectionBytes);
  while (!reader.eof) {
    const entry = ScSpecEntryReadable.read(reader);
    switch (entry.switch().name) {
      case 'scSpecEntryFunctionV0': {
        const fn = entry.functionV0();
        iface.functions[fn.name().toString()] = {
          name: fn.name().toString(),
          inputs: fn
            .inputs()
            .map((p: xdr.ScSpecFunctionInputV0) => ({ name: p.name().toString(), type: typeToString(p.type()) })),
          outputs: fn.outputs().map((t: xdr.ScSpecTypeDef) => typeToString(t)),
          docs: docsToString(fn.doc()),
        };
        break;
      }
      case 'scSpecEntryUdtStructV0': {
        const s = entry.udtStructV0();
        iface.structs[s.name().toString()] = {
          name: s.name().toString(),
          fields: s
            .fields()
            .map((f: xdr.ScSpecUdtStructFieldV0) => ({ name: f.name().toString(), type: typeToString(f.type()) })),
          docs: docsToString(s.doc()),
        };
        break;
      }
      case 'scSpecEntryUdtUnionV0': {
        const u = entry.udtUnionV0();
        iface.unions[u.name().toString()] = {
          name: u.name().toString(),
          cases: u.cases().map((c: xdr.ScSpecUdtUnionCaseV0) => {
            if (c.switch().name === 'scSpecUdtUnionCaseVoidV0') {
              return { name: c.voidCase().name().toString(), kind: 'void' as const, types: [] };
            }
            const tuple = c.tupleCase();
            return {
              name: tuple.name().toString(),
              kind: 'tuple' as const,
              types: tuple.type().map((t: xdr.ScSpecTypeDef) => typeToString(t)),
            };
          }),
          docs: docsToString(u.doc()),
        };
        break;
      }
      case 'scSpecEntryUdtEnumV0': {
        const e = entry.udtEnumV0();
        iface.enums[e.name().toString()] = {
          name: e.name().toString(),
          cases: e.cases().map((c: xdr.ScSpecUdtEnumCaseV0) => ({ name: c.name().toString(), value: c.value() })),
          docs: docsToString(e.doc()),
        };
        break;
      }
      case 'scSpecEntryUdtErrorEnumV0': {
        const e = entry.udtErrorEnumV0();
        iface.errorEnums[e.name().toString()] = {
          name: e.name().toString(),
          cases: e.cases().map((c: xdr.ScSpecUdtErrorEnumCaseV0) => ({
            name: c.name().toString(),
            value: c.value(),
            docs: docsToString(c.doc()),
          })),
        };
        break;
      }
      default:
        // Forward-compatible: unknown entry kinds are skipped rather than
        // failing the whole decode.
        break;
    }
  }

  return iface;
}

/** Extracts and decodes the public interface directly from raw WASM bytes. */
export function interfaceFromWasm(wasm: Buffer): ContractInterface {
  const sections = extractCustomSections(wasm);
  const specSection = sections['contractspecv0'];
  if (!specSection) {
    throw new Error('No "contractspecv0" custom section found - is this a Soroban contract WASM built with soroban-sdk?');
  }
  return decodeContractSpec(specSection);
}
