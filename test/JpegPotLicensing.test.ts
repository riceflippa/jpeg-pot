import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress, keccak256, parseEther, stringToHex } from "viem";
import { network } from "hardhat";

describe("JpegPotLicensing", async function () {
  const { viem } = await network.create();
  const [owner, member, buyer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const intakeTermsHash = keccak256(stringToHex("JPEG Pot Intake Terms v1"));
  const licenseTermsHash = keccak256(stringToHex("JPEG Pot Usage License v1"));
  const manifestHash = keccak256(stringToHex("ipfs://package-manifest"));

  async function deployFixture() {
    const vault = await viem.deployContract("JpegPotVault", [
      owner.account.address,
      0n,
      intakeTermsHash,
      "https://example.com/intake/v1",
    ]);
    const licensing = await viem.deployContract("JpegPotLicensing", [
      owner.account.address,
      vault.address,
    ]);
    const nft = await viem.deployContract("MockERC721");
    await vault.write.setLicenseOperator([licensing.address, true]);
    return { vault, licensing, nft };
  }

  it("sells a crypto license, locks its deposited media, and routes revenue", async function () {
    const { vault, licensing, nft } = await deployFixture();
    await nft.write.mint([member.account.address]);
    await nft.write.approve([vault.address, 1n], { account: member.account });
    await vault.write.depositERC721([nft.address, 1n, intakeTermsHash, true], {
      account: member.account,
    });

    const price = parseEther("0.05");
    await licensing.write.createPackage([
      manifestHash,
      licenseTermsHash,
      price,
      31_536_000n,
      1,
      "https://example.com/packages/1",
      "https://example.com/licenses/commercial-v1",
      [1n],
    ]);

    await licensing.write.purchaseNative([1n, buyer.account.address], {
      account: buyer.account,
      value: price,
    });

    assert.equal(getAddress(await licensing.read.ownerOf([1n])), getAddress(buyer.account.address));
    assert.equal(await licensing.read.receiptIsValid([1n]), true);
    assert.equal(await vault.read.totalNativeRevenue(), price);

    const position = await vault.read.positions([1n]);
    const block = await publicClient.getBlock();
    assert.ok(position[5] > block.timestamp);

    await viem.assertions.revertWithCustomError(
      licensing.write.transferFrom([buyer.account.address, member.account.address, 1n], {
        account: buyer.account,
      }),
      licensing,
      "NonTransferable",
    );
  });

  it("sells a perpetual public-domain package only through native settlement", async function () {
    const { licensing } = await deployFixture();
    const price = parseEther("0.006");
    await licensing.write.createPackage([
      manifestHash,
      licenseTermsHash,
      price,
      0n,
      0,
      "https://example.com/packages/public-domain-media",
      "https://creativecommons.org/publicdomain/zero/1.0/",
      [],
    ]);

    await licensing.write.purchaseNative([1n, buyer.account.address], {
      account: buyer.account,
      value: price,
    });

    assert.equal(getAddress(await licensing.read.ownerOf([1n])), getAddress(buyer.account.address));
    const receipt = await licensing.read.receipts([1n]);
    assert.equal(receipt[4], (1n << 64n) - 1n);
    assert.equal(receipt[5], price);
  });

  it("rejects owner-restricted packages without an active rights attestation", async function () {
    const { vault, licensing, nft } = await deployFixture();
    await nft.write.mint([member.account.address]);
    await nft.write.approve([vault.address, 1n], { account: member.account });
    await vault.write.depositERC721([nft.address, 1n, intakeTermsHash, false], {
      account: member.account,
    });

    await viem.assertions.revertWithCustomError(
      licensing.write.createPackage([
        manifestHash,
        licenseTermsHash,
        parseEther("0.01"),
        86_400n,
        1,
        "https://example.com/packages/restricted",
        "https://example.com/licenses/commercial-v1",
        [1n],
      ]),
      licensing,
      "InvalidRightsSource",
    );
  });
});
