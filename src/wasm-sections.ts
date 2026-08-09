/**
 * Minimal WASM binary format walker.
 *
 * Soroban contracts embed two custom sections in the compiled WASM:
 *   - "contractspecv0": a concatenated stream of XDR-encoded SCSpecEntry
 *     records describing every exported function, struct, union, enum and
 *     error enum in the contract's public interface.
 *   - "contractmetav0": free-form XDR-encoded key/value metadata (e.g. rustc
 *     version, contract name) set via #[contractmeta!].
 *
 * There is no crate/package that exposes this parsing for Node, so we walk
 * the module ourselves. This only needs to understand section framing
 * (LEB128-prefixed name + payload) - it does not need to understand
 * instructions, types, or any other part of the module.
 */

export interface WasmCustomSections {
  [name: string]: Buffer;
}

function readULEB128(buf: Buffer, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    const byte = buf[pos];
    pos += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, next: pos };
}

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

/**
 * Extracts every custom section from a WASM module, keyed by section name.
 * Multiple sections sharing a name (uncommon, but legal) are concatenated,
 * matching how Soroban's own tooling reassembles contractspecv0.
 */
export function extractCustomSections(wasm: Buffer): WasmCustomSections {
  if (!wasm.subarray(0, 4).equals(WASM_MAGIC)) {
    throw new Error('Not a WASM binary (bad magic number)');
  }

  const sections: WasmCustomSections = {};
  let offset = 8; // skip magic (4) + version (4)

  while (offset < wasm.length) {
    const sectionId = wasm[offset];
    offset += 1;
    const { value: sectionLen, next: afterLen } = readULEB128(wasm, offset);
    offset = afterLen;
    const sectionEnd = offset + sectionLen;

    if (sectionId === 0) {
      // Custom section: LEB128 name length + name bytes + payload.
      const { value: nameLen, next: afterNameLen } = readULEB128(wasm, offset);
      const nameStart = afterNameLen;
      const nameEnd = nameStart + nameLen;
      const name = wasm.subarray(nameStart, nameEnd).toString('utf8');
      const payload = wasm.subarray(nameEnd, sectionEnd);
      sections[name] = sections[name] ? Buffer.concat([sections[name], payload]) : Buffer.from(payload);
    }

    offset = sectionEnd;
  }

  return sections;
}
