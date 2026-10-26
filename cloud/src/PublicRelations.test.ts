import { Timestamp } from "firebase-admin/firestore";
import { isPublished, PublishPeriodEndedError, toPublishPeriod } from "./services/PublicRelations";
import { PrAsset, CONSENT_VERSION } from "./schema/pr_asset";

const baseAsset: PrAsset = {
  id: "asset-1",
  status: "approved",
  tag: "お知らせ",
  title: "テスト告知",
  description: "テスト用の説明",
  contentType: "image/jpeg",
  size: 1024,
  publishFrom: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
  publishUntil: Timestamp.fromDate(new Date("2026-12-31T23:59:59Z")),
  createdAt: Timestamp.fromDate(new Date("2025-12-01T00:00:00Z")),
  submittedBy: { uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp" },
  consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date("2025-12-01T00:00:00Z")) },
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

describe("toPublishPeriod", () => {
  const now = new Date("2026-10-26T03:00:00Z"); // 日本時間の10/26 12:00

  test("始まりは日本時間の0:00、終わりは日本時間の23:59:59になる", () => {
    const period = toPublishPeriod("2026-10-01", "2026-10-31", now);
    expect(period.publishFrom.toDate().toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(period.publishUntil?.toDate().toISOString()).toBe("2026-10-31T14:59:59.000Z");
  });

  test("終わりを省略すると無期限(null)", () => {
    expect(toPublishPeriod("2026-10-01", undefined, now).publishUntil).toBeNull();
  });

  test("始まりは今日より前でもよい", () => {
    expect(() => toPublishPeriod("2020-01-01", undefined, now)).not.toThrow();
  });

  test("終わりが今日(日本時間)より前なら例外を投げる。今日なら通す", () => {
    expect(() => toPublishPeriod("2026-10-01", "2026-10-25", now)).toThrow(PublishPeriodEndedError);
    expect(() => toPublishPeriod("2026-10-01", "2026-10-26", now)).not.toThrow();
  });

  test("今日かどうかは、日本時間の日付の境目で判定する", () => {
    //UTCではどちらも10/26だが、日本時間では10/26 23:59:59と10/27 0:00
    expect(() => toPublishPeriod("2026-10-01", "2026-10-26", new Date("2026-10-26T14:59:59Z"))).not.toThrow();
    expect(() => toPublishPeriod("2026-10-01", "2026-10-26", new Date("2026-10-26T15:00:00Z"))).toThrow(PublishPeriodEndedError);
  });

  test("isPublishedでは、終わりの日の日本時間23:59:59まで出て、次の日の0:00には出ない", () => {
    const period = toPublishPeriod("2026-10-01", "2026-10-31", now);
    const asset = { ...baseAsset, ...period };
    expect(isPublished(asset, new Date("2026-09-30T15:00:00Z"))).toBe(true);
    expect(isPublished(asset, new Date("2026-09-30T14:59:59Z"))).toBe(false);
    expect(isPublished(asset, new Date("2026-10-31T14:59:59Z"))).toBe(true);
    expect(isPublished(asset, new Date("2026-10-31T15:00:00Z"))).toBe(false);
  });
});
