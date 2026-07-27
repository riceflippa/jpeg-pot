/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EVM_VAULT_ADDRESS?: `0x${string}`;
  readonly VITE_EVM_LICENSING_ADDRESS?: `0x${string}`;
  readonly VITE_EVM_LICENSING_POLYGON_AMOY?: `0x${string}`;
  readonly VITE_EVM_LICENSING_POLYGON?: `0x${string}`;
  readonly VITE_EVM_LICENSING_ETHEREUM?: `0x${string}`;
  readonly VITE_EVM_LICENSING_BASE?: `0x${string}`;
  readonly VITE_EVM_LICENSING_ARBITRUM?: `0x${string}`;
  readonly VITE_SOLANA_CLUSTER?: "devnet" | "mainnet-beta";
  readonly VITE_SOLANA_PROGRAM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
