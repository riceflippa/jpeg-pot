import { describe, expect, it } from "vitest";
import { createSolanaPurchasePlan } from "./solana";

describe("Solana purchase instruction", () => {
  it("derives deterministic package and unique receipt PDAs without key material", async () => {
    const input = {
      programId: "EWKyg1oNdNTNYoXegBwRG2ZHm5GqePQUjgFk7JRYMqtL",
      packageId: 1n,
      purchaser: "11111111111111111111111111111111",
      beneficiary: "11111111111111111111111111111111",
    };
    const first = await createSolanaPurchasePlan({ ...input, receiptNonce: 1n });
    const repeat = await createSolanaPurchasePlan({ ...input, receiptNonce: 1n });
    const second = await createSolanaPurchasePlan({ ...input, receiptNonce: 2n });

    expect(first.packageAccount).toBe(repeat.packageAccount);
    expect(first.receipt).toBe(repeat.receipt);
    expect(second.receipt).not.toBe(first.receipt);
    expect(first.instruction.accounts).toHaveLength(6);
    expect(first.instruction.data).toHaveLength(16);
  });
});
