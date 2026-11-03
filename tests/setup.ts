import { beforeEach, vi } from "vitest";

beforeEach(() => {
  // Never inherit a developer's or CI host's real credentials.
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  // Fail closed if a test forgets to install its endpoint mock.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error(
        "Unexpected network call: Gemini must be mocked in tests",
      );
    }),
  );
});
