import { describe, expect, it } from "vitest";
import worker from "../worker/index";

const assets = {
  fetch: async () => new Response("asset"),
};

describe("Cloudflare Worker", () => {
  it("reports blockchain-only settlement", async () => {
    const response = await worker.fetch(
      new Request("https://luckycommons.example/api/health"),
      { ASSETS: assets },
    );
    await expect(response.json()).resolves.toEqual({ ok: true, payments: "onchain-only" });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).not.toContain("stripe.com");
  });

  it("has no off-chain checkout API", async () => {
    const response = await worker.fetch(
      new Request("https://luckycommons.example/api/checkout/card", { method: "POST" }),
      { ASSETS: assets },
    );
    expect(response.status).toBe(404);
  });
});
