const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");

describe("Authentication Routes Integration Tests", () => {
  beforeAll(async () => {
    // Connect to test database or setup in-memory mongo before running
  });

  afterAll(async () => {
    // Close database hooks cleanly
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe("POST /api/auth/register", () => {
    it("should block registrations with invalid emails", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser",
          email: "bad-email",
          password: "SecurePassword123!"
        })
        .expect(400);

      expect(res.body).toHaveProperty("success", false);
      expect(res.body.message).toMatch(/email/i);
    });
  });
});
