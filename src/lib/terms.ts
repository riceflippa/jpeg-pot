import { keccak256, stringToHex } from "viem";

export const TERMS_VERSION = 1;
export const DEFAULT_TERMS_URI = "https://luckycommons.luckycommons.workers.dev/terms/v1";
export const TERMS_TITLE = "Your NFT enters. Your rights stay explicit.";
export const TERMS_LEDE = "An NFT may enter Lucky Commons as a pool position without being offered for commercial use. Licensing is optional and only applies when the depositor affirmatively attests they hold the necessary rights and the collection license is independently reviewed.";
export const TERMS_SECTIONS = [
  {
    title: "1. Custody and withdrawal",
    body: "Your asset is held by a chain-local smart contract. You may withdraw after the cooldown unless a license accepted while your position was active remains in force.",
  },
  {
    title: "2. License grant",
    body: "For eligible positions, you grant Lucky Commons a non-exclusive, worldwide right to package and sublicense the associated media only for disclosed commercial deals. Ownership of the NFT does not transfer.",
  },
  {
    title: "3. Revenue",
    body: "Net licensing revenue may fund prizes, member distributions, operating reserves, and transparent $LUCK buy-and-burn transactions according to the published pool policy.",
  },
  {
    title: "4. No rights, no sale",
    body: "Assets without verified commercial rights can remain membership positions, but they are excluded from licensed media packs.",
  },
] as const;
export const TERMS_LEGAL_NOTE = "Draft product terms, not legal advice. Obtain jurisdiction-specific counsel before production launch.";

export const TERMS_TEXT = [
  `Lucky Commons Media License Terms v${TERMS_VERSION}`,
  TERMS_TITLE,
  TERMS_LEDE,
  ...TERMS_SECTIONS.flatMap(({ title, body }) => [title, body]),
  TERMS_LEGAL_NOTE,
].join("\n\n");

export const TERMS_HASH = keccak256(stringToHex(TERMS_TEXT));
