import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { v1Router } from "@/routers/v1Router";

function createApp() {
  return new Elysia().use(v1Router);
}

describe("GET /v1/health", () => {
  it("returns public manager health for callback reachability checks", async () => {
    const response = await createApp().handle(new Request("http://localhost/v1/health"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.service).toBe("manager");
    expect(body.status).toBe("ok");
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });
});
