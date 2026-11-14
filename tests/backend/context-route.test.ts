import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), context: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", async (original) => ({ ...await original<object>(), requireUser: mocks.requireUser }));
vi.mock("@/lib/learning/context", () => ({ getLearningContext: mocks.context }));
import { BackendError } from "@/lib/supabase/auth";
import { GET } from "@/app/api/learning-context/route";

const result = { conceptId: "algebra.distributive-property", events: [], summary: "" };
function request(query = "conceptId=algebra.distributive-property") { return new Request(`http://localhost:3000/api/learning-context?${query}`); }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockImplementation(async () => ({ userId: "verified-owner", headers: new Headers({ "Cache-Control": "private, no-store", Pragma: "no-cache" }) }));
  mocks.context.mockResolvedValue(result);
});

it("verifies identity and returns context directly with refresh/no-store headers", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(mocks.context).toHaveBeenCalledWith(await mocks.requireUser.mock.results[0].value, result.conceptId);
});

it.each(["", "conceptId=", "conceptId=unsupported", "conceptId=algebra.distributive-property&user_id=forged", "conceptId=algebra.distributive-property&sessionId=forged", "conceptId=algebra.distributive-property&conceptId=algebra.distributive-property"])(
  "rejects missing/duplicate/unsupported or ownership-filter query fields (%s)", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(mocks.context).not.toHaveBeenCalled();
  },
);

it.each([[401, "unauthenticated"], [503, "not-configured"], [502, "auth-unavailable"]])("preserves bounded auth failure %s", async (status, code) => {
  mocks.requireUser.mockRejectedValue(new BackendError(status, code, "Safe failure.", new Headers({ Pragma: "no-cache" })));
  const response = await GET(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code, message: "Safe failure.", retryable: status >= 500 } });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(mocks.context).not.toHaveBeenCalled();
});

it("sanitizes unexpected failures and keeps refresh headers", async () => {
  mocks.context.mockRejectedValue(new Error("private backend details"));
  const response = await GET(request());
  expect(response.status).toBe(502);
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(await response.text()).not.toContain("private backend details");
});
