declare module '@stellar/js-xdr' {
  export class XdrReader {
    constructor(buffer: Buffer);
    eof: boolean;
    advance(n: number): void;
    rewind(n: number): void;
    read(n: number): Buffer;
    readInt32BE(): number;
    readUInt32BE(): number;
    readBigInt64BE(): bigint;
    readBigUInt64BE(): bigint;
    readFloatBE(): number;
    readDoubleBE(): number;
    ensureInputConsumed(): void;
  }
}
