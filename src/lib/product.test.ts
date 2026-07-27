import { describe, expect, it } from "vitest";
import { assetLabel, isConfiguredAddress, nftStandards, shortenAddress, supportedNetworks } from "./product";

describe("product adapters", () => {
  it("ships EVM and Solana network families", () => {
    expect(new Set(supportedNetworks.map((network) => network.family))).toEqual(new Set(["EVM", "SVM"]));
    expect(nftStandards).toContain("ERC-1155");
    expect(nftStandards).toContain("Metaplex Core");
  });

  it("validates configured EVM vault addresses", () => {
    expect(isConfiguredAddress("0x1111111111111111111111111111111111111111")).toBe(true);
    expect(isConfiguredAddress("not-an-address")).toBe(false);
  });

  it("formats human-readable positions", () => {
    expect(shortenAddress("0x1111111111111111111111111111111111111111")).toBe("0x1111…1111");
    expect(assetLabel("ERC-721", "0x1111111111111111111111111111111111111111", "42"))
      .toContain("#42");
  });
});
