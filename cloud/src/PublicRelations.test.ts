import { Timestamp } from "firebase-admin/firestore";
import { isPublished } from "./services/PublicRelations";
import { PrAsset } from "./repositories/firestore";

const baseAsset: PrAsset = {
  id: "asset-1",
  status: "approved",
  title: "テスト告知",
  contentType: "image/jpeg",
  size: 1024,
  publishFrom: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
  publishUntil: Timestamp.fromDate(new Date("2026-12-31T23:59:59Z")),
  createdAt: Timestamp.fromDate(new Date("2025-12-01T00:00:00Z")),
};

const now = new Date("2026-06-01T00:00:00Z");

describe("isPublished", () => {
  test("statusがapproved以外なら除外", () => {
    expect(isPublished({ ...baseAsset, status: "pending" }, now)).toBe(false);
  });

  test("publishFromより前なら除外", () => {
    const asset = { ...baseAsset, publishFrom: Timestamp.fromDate(new Date("2026-07-01T00:00:00Z")) };
    expect(isPublished(asset, now)).toBe(false);
  });

  test("publishUntilを過ぎていたら除外", () => {
    const asset = { ...baseAsset, publishUntil: Timestamp.fromDate(new Date("2026-05-01T00:00:00Z")) };
    expect(isPublished(asset, now)).toBe(false);
  });

  test("publishUntilがnull(無期限)なら含める", () => {
    expect(isPublished({ ...baseAsset, publishUntil: null }, now)).toBe(true);
  });

  test("期間内かつapprovedなら含める", () => {
    expect(isPublished(baseAsset, now)).toBe(true);
  });
});