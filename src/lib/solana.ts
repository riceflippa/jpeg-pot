import { autoDiscover, createClient } from "@solana/client";
import {
  AccountRole,
  address,
  compileTransaction,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";

export const solanaCluster = import.meta.env.VITE_SOLANA_CLUSTER ?? "devnet";
const endpoint = solanaCluster === "mainnet-beta"
  ? "https://api.mainnet-beta.solana.com"
  : "https://api.devnet.solana.com";

export const solanaClient = createClient({
  endpoint,
  websocketEndpoint: endpoint.replace("https://", "wss://"),
  walletConnectors: autoDiscover(),
});

export const SOLANA_SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();

function u64Le(value: bigint) {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error("Value does not fit in u64");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

async function anchorDiscriminator(name: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(`global:${name}`));
  return new Uint8Array(digest).slice(0, 8);
}

function concatBytes(...values: Uint8Array[]) {
  const output = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

export type SolanaPurchasePlan = {
  instruction: Instruction;
  program: Address;
  config: Address;
  packageAccount: Address;
  receipt: Address;
  purchaser: Address;
  beneficiary: Address;
  receiptNonce: bigint;
};

export async function createSolanaPurchasePlan(input: {
  programId: string;
  packageId: bigint;
  purchaser: string;
  beneficiary: string;
  receiptNonce: bigint;
}): Promise<SolanaPurchasePlan> {
  const program = address(input.programId);
  const purchaser = address(input.purchaser);
  const beneficiary = address(input.beneficiary);
  const packageIdBytes = u64Le(input.packageId);
  const nonceBytes = u64Le(input.receiptNonce);
  const [config] = await getProgramDerivedAddress({
    programAddress: program,
    seeds: [textEncoder.encode("config")],
  });
  const [packageAccount] = await getProgramDerivedAddress({
    programAddress: program,
    seeds: [textEncoder.encode("package"), packageIdBytes],
  });
  const [receipt] = await getProgramDerivedAddress({
    programAddress: program,
    seeds: [
      textEncoder.encode("receipt"),
      addressEncoder.encode(packageAccount),
      addressEncoder.encode(purchaser),
      nonceBytes,
    ],
  });
  const data = concatBytes(await anchorDiscriminator("purchase_license"), nonceBytes);
  const instruction: Instruction = {
    programAddress: program,
    accounts: [
      { address: purchaser, role: AccountRole.WRITABLE_SIGNER },
      { address: beneficiary, role: AccountRole.READONLY },
      { address: config, role: AccountRole.WRITABLE },
      { address: packageAccount, role: AccountRole.READONLY },
      { address: receipt, role: AccountRole.WRITABLE },
      { address: SOLANA_SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data,
  };

  return {
    instruction,
    program,
    config,
    packageAccount,
    receipt,
    purchaser,
    beneficiary,
    receiptNonce: input.receiptNonce,
  };
}

export type SolanaSimulation = {
  ok: boolean;
  error: unknown;
  logs: readonly string[];
  unitsConsumed: bigint | null;
};

export async function simulateSolanaPurchase(plan: SolanaPurchasePlan): Promise<SolanaSimulation> {
  const prepared = await solanaClient.transaction.prepare({
    instructions: [plan.instruction],
    feePayer: plan.purchaser,
    commitment: "confirmed",
  });
  const transaction = compileTransaction(prepared.message);
  const wireTransaction = getBase64EncodedWireTransaction(transaction);
  const result = await solanaClient.runtime.rpc.simulateTransaction(wireTransaction, {
    encoding: "base64",
    commitment: "confirmed",
    sigVerify: false,
  }).send();

  return {
    ok: result.value.err == null,
    error: result.value.err,
    logs: result.value.logs ?? [],
    unitsConsumed: result.value.unitsConsumed ?? null,
  };
}

export function createReceiptNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return new DataView(bytes.buffer).getBigUint64(0, true);
}
