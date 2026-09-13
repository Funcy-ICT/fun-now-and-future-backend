import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { app } from "./app";

const VALID_API_KEY = "funcy_esp32_secret_key_2026";

describe("GET /signage/assets", () => {
  const originalBucket = process.env.PR_ASSET_BUCKET;

  beforeAll(() => {
    process.env.PR_ASSET_BUCKET = "test-pr-assets-bucket";
  });

  afterAll(() => {
    process.env.PR_ASSET_BUCKET = originalBucket;
  });

  test("掲載期間内のapprovedなアセットが、URL付きで返る", async () => {
    const db = getFirestore();
    const id = "signage-asset-test-1";

    await db.collection("prAssets").doc(id).set({
      id,
      status: "approved",
      title: "秋のコンテスト告知",
      contentType: "image/jpeg",
      size: 12345,
      publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      publishUntil: null,
      createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
    });

    try {
      const res = await app.request("/signage/assets", {
        headers: { "x-api-key": VALID_API_KEY },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.assets).toContainEqual({
        id,
        title: "秋のコンテスト告知",
        contentType: "image/jpeg",
        url: "https://storage.googleapis.com/test-pr-assets-bucket/objects/signage-asset-test-1",
        publishUntil: null,
      });
    } finally {
      await db.collection("prAssets").doc(id).delete();
    }
  });
})