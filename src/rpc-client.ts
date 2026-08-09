import { rpc } from '@stellar/stellar-sdk';

/**
 * Fetches the currently-installed WASM bytecode for a deployed contract
 * from Stellar RPC. Soroban resolves a contract address to a wasm hash via
 * its ContractCode ledger entry; `getContractWasmByContractId` does that
 * resolution and the ledger-entry fetch in one call.
 */
export async function fetchDeployedWasm(rpcUrl: string, contractId: string): Promise<Buffer> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  try {
    const wasm = await server.getContractWasmByContractId(contractId);
    return Buffer.from(wasm);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to fetch WASM for contract ${contractId} from ${rpcUrl}: ${message}. ` +
        `Confirm the contract address is correct and deployed on the network this RPC endpoint serves.`,
    );
  }
}
