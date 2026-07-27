import { keccak256, stringToHex } from "viem";

export const LICENSE_TERMS_VERSION = 1;
export const LICENSE_TERMS_TITLE = "Lucky Commons Media Usage License";
export const LICENSE_TERMS_LEDE =
  "These terms explain what a buyer receives, where the media rights come from, and what the on-chain receipt proves.";

export const LICENSE_TERMS_SECTIONS = [
  {
    title: "1. Package and receipt",
    body: "Each purchase identifies a media-package manifest, a rights source, a terms hash, a beneficiary, a payment reference, and a validity period. A blockchain receipt is evidence of that record; it is not ownership of the source NFT or its trademarks.",
  },
  {
    title: "2. Public-domain packages",
    body: "A package labeled CC0 uses media that the collection has dedicated to the public domain. The underlying media remains free for anyone to use. Any fee buys prepared-file access, provenance verification, a receipt, and service—not exclusive copyright or control of the NFT.",
  },
  {
    title: "3. Depositor-authorized packages",
    body: "A package labeled Owner authorized is offered only while its NFT is held in a chain-local Lucky Commons vault and the depositor has attested that commercial media rights can be granted. The buyer receives a non-exclusive, worldwide license for the uses and period stated in that package, subject to the collection's governing terms.",
  },
  {
    title: "4. Permitted uses",
    body: "Unless a package says otherwise, licensed media may be reproduced, adapted, displayed, and distributed in websites, social media, editorial work, advertising, games, applications, presentations, and merchandise. Package-specific limits shown at checkout form part of the license record.",
  },
  {
    title: "5. Limits",
    body: "A receipt does not grant trademark, publicity, privacy, or false-endorsement rights. The buyer must not imply that an NFT owner or collection endorses the buyer. Media may not be used unlawfully or passed off as an exclusive license. Restrictions cannot reduce rights that already exist in genuinely public-domain media.",
  },
  {
    title: "6. Access and settlement",
    body: "Every purchase is settled in the selected blockchain's native asset and recorded atomically with its receipt. Protected source files may be delivered through time-limited access links; the durable license evidence is the package manifest plus on-chain receipt, not the download URL.",
  },
  {
    title: "7. Rights provenance",
    body: "Lucky Commons records the collection, chain, token identifier, source metadata hash, rights source, and applicable terms. Buyers should retain the license certificate and package manifest. If an owner-authorized package loses a required rights attestation before purchase, the smart contract rejects issuance.",
  },
] as const;

export const LICENSE_TERMS_LEGAL_NOTE =
  "This beta text is a technical product specification, not legal advice. Production terms and collection-specific grants require qualified legal review.";

export const LICENSE_TERMS_TEXT = [
  `${LICENSE_TERMS_TITLE} v${LICENSE_TERMS_VERSION}`,
  LICENSE_TERMS_LEDE,
  ...LICENSE_TERMS_SECTIONS.flatMap(({ title, body }) => [title, body]),
  LICENSE_TERMS_LEGAL_NOTE,
].join("\n\n");

export const LICENSE_TERMS_HASH = keccak256(stringToHex(LICENSE_TERMS_TEXT));
export const DEFAULT_LICENSE_TERMS_URI = "https://lucky.luckycommons.workers.dev/license/v1";
