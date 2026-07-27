import { network } from "hardhat";
import { DEFAULT_LICENSE_TERMS_URI, LICENSE_TERMS_HASH } from "../src/lib/licenseTerms.ts";
import { DEFAULT_TERMS_URI, TERMS_HASH } from "../src/lib/terms.ts";

const { viem, networkName } = await network.create();
const [deployer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

const termsURI = process.env.TERMS_URI ?? DEFAULT_TERMS_URI;
const termsHash = TERMS_HASH;
const cooldown = 7n * 24n * 60n * 60n;
const token = await viem.deployContract("JpegPotToken", [deployer.account.address]);
const vault = await viem.deployContract("JpegPotVault", [
  deployer.account.address,
  cooldown,
  termsHash,
  termsURI,
]);
const licensing = await viem.deployContract("JpegPotLicensing", [
  deployer.account.address,
  vault.address,
]);

await publicClient.waitForTransactionReceipt({
  hash: await vault.write.setLicenseOperator([licensing.address, true]),
});

console.log(JSON.stringify({
  network: networkName,
  deployer: deployer.account.address,
  token: token.address,
  vault: vault.address,
  licensing: licensing.address,
  catalogPackages: 0,
  catalogPolicy: "Packages are created only after NFT ownership and media-rights review.",
  termsHash,
  termsURI,
  licenseTermsHash: LICENSE_TERMS_HASH,
  licenseTermsURI: DEFAULT_LICENSE_TERMS_URI,
}, null, 2));
