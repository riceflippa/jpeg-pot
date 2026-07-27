import { http } from "viem";
import { arbitrum, base, mainnet, polygon, polygonAmoy } from "viem/chains";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const evmChains = [polygonAmoy, polygon, mainnet, base, arbitrum] as const;

export type EvmPaymentNetwork = {
  chainId: (typeof evmChains)[number]["id"];
  name: string;
  symbol: "POL" | "ETH";
  testnet: boolean;
  licensingAddress?: `0x${string}`;
};

export const evmPaymentNetworks: readonly EvmPaymentNetwork[] = [
  {
    chainId: polygonAmoy.id,
    name: "Polygon Amoy",
    symbol: "POL",
    testnet: true,
    licensingAddress: import.meta.env.VITE_EVM_LICENSING_POLYGON_AMOY ?? import.meta.env.VITE_EVM_LICENSING_ADDRESS,
  },
  {
    chainId: polygon.id,
    name: "Polygon",
    symbol: "POL",
    testnet: false,
    licensingAddress: import.meta.env.VITE_EVM_LICENSING_POLYGON,
  },
  {
    chainId: mainnet.id,
    name: "Ethereum",
    symbol: "ETH",
    testnet: false,
    licensingAddress: import.meta.env.VITE_EVM_LICENSING_ETHEREUM,
  },
  {
    chainId: base.id,
    name: "Base",
    symbol: "ETH",
    testnet: false,
    licensingAddress: import.meta.env.VITE_EVM_LICENSING_BASE,
  },
  {
    chainId: arbitrum.id,
    name: "Arbitrum One",
    symbol: "ETH",
    testnet: false,
    licensingAddress: import.meta.env.VITE_EVM_LICENSING_ARBITRUM,
  },
] as const;

export const wagmiConfig = createConfig({
  chains: evmChains,
  connectors: [injected()],
  transports: {
    [polygonAmoy.id]: http(),
    [polygon.id]: http(),
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
  },
});

export const erc721Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const erc1155Abi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

export const vaultAbi = [
  {
    type: "function",
    name: "depositERC721",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collection", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "acceptedTermsHash", type: "bytes32" },
      { name: "commercialRightsAttested", type: "bool" },
    ],
    outputs: [{ name: "positionId", type: "uint256" }],
  },
  {
    type: "function",
    name: "depositERC1155",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collection", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "acceptedTermsHash", type: "bytes32" },
      { name: "commercialRightsAttested", type: "bool" },
    ],
    outputs: [{ name: "positionId", type: "uint256" }],
  },
] as const;

export const licensingAbi = [
  {
    type: "function",
    name: "purchaseNative",
    stateMutability: "payable",
    inputs: [
      { name: "packageId", type: "uint256" },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
] as const;
