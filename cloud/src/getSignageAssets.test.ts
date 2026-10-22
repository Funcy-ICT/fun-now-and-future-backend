import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { app } from "./app";
import { SignageAssetsResponseSchema } from "./schema/api/signage";
import { TEST_API_KEY } from "./testing/api_key";
import { CONSENT_VERSION } from "./schema/pr_asset";

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
      tag: "イベント",
      title: "秋のコンテスト告知",
      description: "10月31日まで作品を募集しています",
      contentType: "image/jpeg",
      size: 12345,
      publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      publishUntil: null,
      createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      submittedBy: { uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp" },
      consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")) },
    });

    try {
      const res = await app.request("/signage/assets", {
        headers: { "x-api-key": TEST_API_KEY },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(SignageAssetsResponseSchema.safeParse(json).success).toBe(true);
      expect(json.assets).toContainEqual({
        id,
        tag: "イベント",
        title: "秋のコンテスト告知",
        description: "10月31日まで作品を募集しています",
        media: {
          url: "https://storage.googleapis.com/test-pr-assets-bucket/objects/signage-asset-test-1",
          contentType: "image/jpeg",
        },
        publishUntil: null,
      });
    } finally {
      await db.collection("prAssets").doc(id).delete();
    }});

  test("掲載期間外(publishUntilが過去)のアセットは一覧に出ない", async () => {
    const db = getFirestore();
    const id = "signage-asset-test-expired";

    await db.collection("prAssets").doc(id).set({
      id,
      status: "approved",
      tag: "お知らせ",
      title: "終了済み告知",
      description: "",
      contentType: "image/jpeg",
      size: 100,
      publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      publishUntil: Timestamp.fromDate(new Date("2020-02-01T00:00:00Z")),
      createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      submittedBy: { uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp" },
      consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")) },
    });

    try {
      const res = await app.request("/signage/assets", {
        headers: { "x-api-key": TEST_API_KEY },
      });
      const json = await res.json();
      expect(SignageAssetsResponseSchema.safeParse(json).success).toBe(true);
      expect(json.assets.find((a: { id: string }) => a.id === id)).toBeUndefined();
    } finally {
      await db.collection("prAssets").doc(id).delete();
    }
  });
  test("contentTypeがPDFのアセットは一覧に出ない", async () => {
    const db = getFirestore();
    const id = "signage-asset-test-pdf";

    await db.collection("prAssets").doc(id).set({
      id,
      status: "approved",
      tag: "お知らせ",
      title: "PDFの告知",
      description: "",
      contentType: "application/pdf",
      size: 100,
      publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      publishUntil: null,
      createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      submittedBy: { uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp" },
      consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")) },
    });

    try {
      const res = await app.request("/signage/assets", {
        headers: { "x-api-key": TEST_API_KEY },
      });
      const json = await res.json();
      expect(SignageAssetsResponseSchema.safeParse(json).success).toBe(true);
      expect(json.assets.find((a: { id: string }) => a.id === id)).toBeUndefined();
    } finally {
      await db.collection("prAssets").doc(id).delete();
    }
  });
  test("submittedByかconsentが無いアセットは一覧に出ない", async () => {
    const db = getFirestore();
    const base = {
      status: "approved",
      tag: "お知らせ",
      title: "投稿者の無い告知",
      description: "",
      contentType: "image/jpeg",
      size: 100,
      publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      publishUntil: null,
      createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
    };
    const noSubmitter = "signage-asset-test-no-submitter";
    const noConsent = "signage-asset-test-no-consent";

    await db.collection("prAssets").doc(noSubmitter).set({
      ...base,
      id: noSubmitter,
      consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")) },
    });
    await db.collection("prAssets").doc(noConsent).set({
      ...base,
      id: noConsent,
      submittedBy: { uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp" },
    });

    try {
      const res = await app.request("/signage/assets", {
        headers: { "x-api-key": TEST_API_KEY },
      });
      const json = await res.json();
      const ids = json.assets.map((a: { id: string }) => a.id);
      expect(ids).not.toContain(noSubmitter);
      expect(ids).not.toContain(noConsent);
    } finally {
      await db.collection("prAssets").doc(noSubmitter).delete();
      await db.collection("prAssets").doc(noConsent).delete();
    }
  });

  test("レスポンスに、投稿した人と掲載許諾が含まれない", async () => {
    const db = getFirestore();
    const id = "signage-asset-test-submitter-hidden";

    await db.collection("prAssets").doc(id).set({
      id,
      status: "approved",
      tag: "お知らせ",
      title: "投稿者を返さない告知",
      description: "",
      contentType: "image/png",
      size: 100,
      publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      publishUntil: null,
      createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      submittedBy: { uid: "google-oauth2|hidden-uid", email: "hidden-poster@fun.ac.jp" },
      consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")) },
    });

    try {
      const res = await app.request("/signage/assets", {
        headers: { "x-api-key": TEST_API_KEY },
      });
      const body = await res.text();
      const asset = JSON.parse(body).assets.find((a: { id: string }) => a.id === id);
      expect(asset).toBeDefined();
      expect(asset).not.toHaveProperty("submittedBy");
      expect(asset).not.toHaveProperty("consent");
      expect(body).not.toContain("hidden-poster@fun.ac.jp");
      expect(body).not.toContain("google-oauth2|hidden-uid");
    } finally {
      await db.collection("prAssets").doc(id).delete();
    }
  });

  test("APIキーがない場合401を返す", async () => {
    const res = await app.request("/signage/assets");
    expect(res.status).toBe(401);
  });

  test("APIキーが間違っている場合401を返す", async () => {
    const res = await app.request("/signage/assets", {
      headers: { "x-api-key": "wrong-api-key" },
    });
    expect(res.status).toBe(401);
  });
  });
  