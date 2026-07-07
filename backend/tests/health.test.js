const request = require("supertest");
const app = require("../src/app");

describe("GET /health", () => {
  it("should return 200 OK and health status payloads", async () => {
    // Note: In real CI runs, ensure dependencies (like supertest) are installed
    const res = await request(app)
      .get("/health")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body).toHaveProperty("status", "success");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("timestamp");
  });
});
