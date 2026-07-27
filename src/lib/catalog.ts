import { keccak256, parseEther, stringToHex } from "viem";

export const catalogCategories = [
  "All media",
  "Abstract",
  "Characters",
  "Fashion",
  "Gaming",
  "Photography",
  "3D",
] as const;

export type CatalogCategory = Exclude<(typeof catalogCategories)[number], "All media">;

export type CatalogAsset = {
  packageId: bigint;
  slug: string;
  name: string;
  category: CatalogCategory;
  chain: "Ethereum" | "Polygon" | "Base" | "Arbitrum" | "Solana";
  standard: "ERC-721" | "ERC-1155" | "Metaplex";
  visual: string;
  nativePrice: bigint;
  nativePriceLabel: string;
  solanaPriceLamports: bigint;
  solanaPriceLabel: string;
  licenseLabel: string;
  licenseSummary: string;
  permittedUses: readonly string[];
  manifestHash: `0x${string}`;
  isPreview: true;
};

const NATIVE_PRICE = parseEther("0.006");
const SOLANA_PRICE_LAMPORTS = 50_000_000n;

const previewInventory: Array<Omit<CatalogAsset, "packageId" | "nativePrice" | "nativePriceLabel" | "solanaPriceLamports" | "solanaPriceLabel" | "manifestHash" | "isPreview">> = [
  { slug: "chromatic-form", name: "Chromatic form", category: "Abstract", chain: "Ethereum", standard: "ERC-721", visual: "visual--chromatic", licenseLabel: "Commercial", licenseSummary: "Digital campaigns, social, editorial, and presentation use.", permittedUses: ["Web and social", "Advertising", "Editorial"] },
  { slug: "night-bloom", name: "Night bloom", category: "Photography", chain: "Polygon", standard: "ERC-721", visual: "visual--bloom", licenseLabel: "Commercial", licenseSummary: "Brand, editorial, and digital publishing use.", permittedUses: ["Brand content", "Editorial", "Web and social"] },
  { slug: "signal-portrait", name: "Signal portrait", category: "Characters", chain: "Base", standard: "ERC-721", visual: "visual--portrait", licenseLabel: "Extended", licenseSummary: "Campaign, packaging, and merchandise use.", permittedUses: ["Campaigns", "Packaging", "Merchandise"] },
  { slug: "soft-geometry", name: "Soft geometry", category: "3D", chain: "Solana", standard: "Metaplex", visual: "visual--geometry", licenseLabel: "Commercial", licenseSummary: "Digital products, presentations, and advertising use.", permittedUses: ["Digital products", "Advertising", "Presentations"] },
  { slug: "future-artifact", name: "Future artifact", category: "Gaming", chain: "Arbitrum", standard: "ERC-1155", visual: "visual--artifact", licenseLabel: "Extended", licenseSummary: "Game worlds, promotional media, and physical products.", permittedUses: ["Games", "Promotional media", "Products"] },
  { slug: "electric-terrain", name: "Electric terrain", category: "Abstract", chain: "Ethereum", standard: "ERC-721", visual: "visual--terrain", licenseLabel: "Commercial", licenseSummary: "Background, cover, campaign, and web use.", permittedUses: ["Covers", "Campaigns", "Web"] },
  { slug: "glass-habitat", name: "Glass habitat", category: "3D", chain: "Base", standard: "ERC-721", visual: "visual--glass", licenseLabel: "Commercial", licenseSummary: "Editorial, brand storytelling, and presentation use.", permittedUses: ["Editorial", "Brand storytelling", "Presentations"] },
  { slug: "virtual-fabric", name: "Virtual fabric", category: "Fashion", chain: "Polygon", standard: "ERC-1155", visual: "visual--fabric", licenseLabel: "Extended", licenseSummary: "Fashion campaigns, digital wearables, and retail displays.", permittedUses: ["Campaigns", "Digital wearables", "Retail"] },
  { slug: "kinetic-type", name: "Kinetic type", category: "Abstract", chain: "Solana", standard: "Metaplex", visual: "visual--type", licenseLabel: "Commercial", licenseSummary: "Titles, posters, social, and presentation use.", permittedUses: ["Posters", "Social", "Presentations"] },
  { slug: "synthetic-coast", name: "Synthetic coast", category: "Photography", chain: "Ethereum", standard: "ERC-721", visual: "visual--coast", licenseLabel: "Commercial", licenseSummary: "Travel, editorial, campaign, and background use.", permittedUses: ["Travel", "Editorial", "Campaigns"] },
  { slug: "digital-silhouette", name: "Digital silhouette", category: "Characters", chain: "Arbitrum", standard: "ERC-721", visual: "visual--silhouette", licenseLabel: "Commercial", licenseSummary: "Editorial illustration, social, and advertising use.", permittedUses: ["Illustration", "Social", "Advertising"] },
  { slug: "pixel-relic", name: "Pixel relic", category: "Gaming", chain: "Base", standard: "ERC-721", visual: "visual--relic", licenseLabel: "Extended", licenseSummary: "Game media, products, and promotional use.", permittedUses: ["Games", "Products", "Promotional media"] },
];

export const catalogAssets: CatalogAsset[] = previewInventory.map((asset, index) => {
  const packageId = BigInt(index + 1);
  const manifest = JSON.stringify({
    version: 1,
    packageId: packageId.toString(),
    category: asset.category,
    chain: asset.chain,
    standard: asset.standard,
    preview: true,
  });

  return {
    ...asset,
    packageId,
    nativePrice: NATIVE_PRICE,
    nativePriceLabel: "0.006",
    solanaPriceLamports: SOLANA_PRICE_LAMPORTS,
    solanaPriceLabel: "0.05 SOL",
    manifestHash: keccak256(stringToHex(manifest)),
    isPreview: true,
  };
});
