import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress, keccak256, parseEther, stringToHex, zeroAddress } from "viem";
import { network } from "hardhat";

describe("JpegPotVault", async function () {
  const { viem } = await network.create();
  const [owner, member, buyer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const termsHash = keccak256(stringToHex("JPEG Pot Media License Terms v1"));

  async function deployFixture(cooldown = 0n) {
    const vault = await viem.deployContract("JpegPotVault", [
      owner.account.address,
      cooldown,
      termsHash,
      "https://example.com/terms/v1",
    ]);
    const nft = await viem.deployContract("MockERC721");
    const editions = await viem.deployContract("MockERC1155");
    await nft.write.mint([member.account.address]);
    await editions.write.mint([member.account.address, 7n, 5n]);
    return { vault, nft, editions };
  }

  it("opens and withdraws an ERC-721 position", async function () {
    const { vault, nft } = await deployFixture();
    await nft.write.approve([vault.address, 1n], { account: member.account });

    await viem.assertions.emitWithArgs(
      vault.write.depositERC721([nft.address, 1n, termsHash, true], { account: member.account }),
      vault,
      "PositionOpened",
      [1n, member.account.address, nft.address, 1n, 1n, 0, true, 1, termsHash],
    );

    assert.equal(getAddress(await nft.read.ownerOf([1n])), getAddress(vault.address));
    assert.equal(await vault.read.activePositionsByMember([member.account.address]), 1n);

    await vault.write.withdraw([1n], { account: member.account });
    assert.equal(getAddress(await nft.read.ownerOf([1n])), getAddress(member.account.address));
    assert.equal(await vault.read.totalActivePositions(), 0n);
  });

  it("supports multiple ERC-1155 positions without losing custody accounting", async function () {
    const { vault, editions } = await deployFixture();
    await editions.write.setApprovalForAll([vault.address, true], { account: member.account });
    await vault.write.depositERC1155([editions.address, 7n, 2n, termsHash, false], {
      account: member.account,
    });
    await vault.write.depositERC1155([editions.address, 7n, 3n, termsHash, true], {
      account: member.account,
    });

    assert.equal(await vault.read.custodiedERC1155([editions.address, 7n]), 5n);
    await vault.write.withdraw([1n], { account: member.account });
    assert.equal(await vault.read.custodiedERC1155([editions.address, 7n]), 3n);
  });

  it("rejects stale terms and direct safe transfers", async function () {
    const { vault, nft } = await deployFixture();
    await nft.write.approve([vault.address, 1n], { account: member.account });

    await viem.assertions.revertWithCustomError(
      vault.write.depositERC721([
        nft.address,
        1n,
        keccak256(stringToHex("stale")),
        true,
      ], { account: member.account }),
      vault,
      "InvalidTerms",
    );

    await viem.assertions.revertWithCustomError(
      nft.write.safeTransferFrom([member.account.address, vault.address, 1n], {
        account: member.account,
      }),
      vault,
      "DirectTransferRejected",
    );
  });

  it("prevents withdrawal while a commercial license is active", async function () {
    const { vault, nft } = await deployFixture();
    await nft.write.approve([vault.address, 1n], { account: member.account });
    await vault.write.depositERC721([nft.address, 1n, termsHash, true], { account: member.account });

    const block = await publicClient.getBlock();
    const lockedUntil = block.timestamp + 86_400n;
    await vault.write.lockForLicense([1n, lockedUntil, keccak256(stringToHex("deal-1"))]);

    await viem.assertions.revertWithCustomError(
      vault.write.withdraw([1n], { account: member.account }),
      vault,
      "AssetLocked",
    );
  });

  it("accepts and allocates native licensing revenue", async function () {
    const { vault } = await deployFixture();
    const sourceId = keccak256(stringToHex("brand-license-1"));
    const purposeId = keccak256(stringToHex("epoch-1-prize"));
    const amount = parseEther("1");

    await vault.write.depositRevenue([sourceId], { account: buyer.account, value: amount });
    assert.equal(await vault.read.totalNativeRevenue(), amount);

    const before = await publicClient.getBalance({ address: member.account.address });
    await vault.write.allocateRevenue([member.account.address, amount, purposeId]);
    const after = await publicClient.getBalance({ address: member.account.address });
    assert.equal(after - before, amount);
  });

  it("mints a fixed POT supply to the treasury", async function () {
    const token = await viem.deployContract("JpegPotToken", [owner.account.address]);
    assert.equal(await token.read.totalSupply(), 1_000_000_000n * 10n ** 18n);
    assert.equal(await token.read.balanceOf([owner.account.address]), await token.read.totalSupply());

    await viem.assertions.revertWithCustomError(
      viem.deployContract("JpegPotToken", [zeroAddress]),
      token,
      "ZeroAddress",
    );
  });
});
