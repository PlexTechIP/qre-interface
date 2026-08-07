// @vitest-environment node

import { describe, expect, it } from "vitest";

import { readProviderErrorReason } from "./providerErrorBody.js";

const respond = (body: string | (() => never)) =>
  ({
    text: async () => {
      if (typeof body === "function") body();
      return body as string;
    },
  }) as unknown as Response;

describe("readProviderErrorReason", () => {
  // Both providers nest the reason the same way, which is why one helper
  // serves both adapters and both validators.
  it("extracts the message from either provider's error envelope", async () => {
    await expect(
      readProviderErrorReason(
        respond(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "schema keyword 'title' is not supported" } })),
      ),
    ).resolves.toBe("schema keyword 'title' is not supported");

    await expect(
      readProviderErrorReason(
        respond(JSON.stringify({ error: { message: "Invalid schema for response_format", code: "invalid_json_schema" } })),
      ),
    ).resolves.toBe("Invalid schema for response_format");
  });

  it("falls back to the raw body when it is not the expected envelope", async () => {
    // A proxy or gateway answering with HTML is still more informative than a
    // bare status code.
    await expect(readProviderErrorReason(respond("<html><body>502 Bad Gateway</body></html>"))).resolves.toContain(
      "502 Bad Gateway",
    );
    await expect(readProviderErrorReason(respond(JSON.stringify({ unexpected: true })))).resolves.toContain(
      "unexpected",
    );
  });

  it("returns null rather than a reason when there is nothing to say", async () => {
    await expect(readProviderErrorReason(respond(""))).resolves.toBeNull();
    await expect(readProviderErrorReason(respond("   \n  "))).resolves.toBeNull();
  });

  // A diagnostic that can fail the request it describes is worse than none.
  it("returns null instead of throwing when the body cannot be read", async () => {
    await expect(
      readProviderErrorReason(
        respond(() => {
          throw new TypeError("body already consumed");
        }),
      ),
    ).resolves.toBeNull();
  });

  it("collapses and truncates a runaway body so it cannot flood the panel", async () => {
    const reason = await readProviderErrorReason(respond("x".repeat(5000)));

    expect(reason).not.toBeNull();
    expect(reason!.length).toBeLessThanOrEqual(401);
    expect(reason!.endsWith("…")).toBe(true);
  });
});
