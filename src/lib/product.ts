export const supportedNetworks = [
  { name: "Polygon", mark: "POL", status: "contracts-tested", family: "EVM" },
  { name: "Ethereum", mark: "ETH", status: "contracts-tested", family: "EVM" },
  { name: "Base", mark: "BASE", status: "contracts-tested", family: "EVM" },
  { name: "Arbitrum", mark: "ARB", status: "contracts-tested", family: "EVM" },
  { name: "Solana", mark: "SOL", status: "host-tested", family: "SVM" },
] as const;

export const nftStandards = [
  "ERC-721",
  "ERC-1155",
  "Metaplex NFT",
  "Programmable NFT",
  "Token-2022 NFT",
  "Metaplex Core",
] as const;

export function shortenAddress(address: string, visible = 4) {
  if (address.length <= visible * 2 + 3) return address;
  return `${address.slice(0, visible + 2)}…${address.slice(-visible)}`;
}

export function isConfiguredAddress(address?: string): address is `0x${string}` {
  return Boolean(address && /^0x[0-9a-fA-F]{40}$/.test(address));
}

export function assetLabel(standard: string, collection: string, tokenId: string) {
  const cleanCollection = collection.trim();
  const cleanToken = tokenId.trim();
  if (!cleanCollection || !cleanToken) return "Add an asset to preview its position";
  return `${standard} · ${shortenAddress(cleanCollection)} · #${cleanToken}`;
}
