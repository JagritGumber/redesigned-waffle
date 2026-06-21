import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import v1Router from "@/routers/v1Router";

function createApp() {
  return new Hono().route("/api/v1", v1Router as any);
}

describe("GET /api/v1/health", () => {
  it("returns public Worker health for callback reachability checks", async () => {
    const response = await createApp().request("/api/v1/health");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.service).toBe("worker");
    expect(body.status).toBe("ok");
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });
});
