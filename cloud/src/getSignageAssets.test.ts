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

  test("掲載期間外(publishUntilが過去)のアセットは一覧に出ない", async () => {
    const db = getFirestore();
    const id = "signage-asset-test-expired";

    await db.collection("prAssets").doc(id).set({
      id,
      status: "approved",
      title: "終了済み告知",
      contentType: "image/jpeg",
      size: 100,
      publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      publishUntil: Timestamp.fromDate(new Date("2020-02-01T00:00:00Z")),
      createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
    });

    try {
      const res = await app.request("/signage/assets", {
        headers: { "x-api-key": VALID_API_KEY },
      });
      const json = await res.json();
      expect(json.assets.find((a: { id: string }) => a.id === id)).toBeUndefined();
    } finally {
      await db.collection("prAssets").doc(id).delete();
    }
  });
  });
})