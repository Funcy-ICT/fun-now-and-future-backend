import { CONSENT_VERSION } from "./schema/pr_asset";
import { PrAssetSubmitInputSchema } from "./schema/api/pr_asset_submit";

const jpeg = (bytes = 100) => new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });

const valid = () => ({
	file: jpeg(),
	tag: "イベント",
	title: "秋のコンテスト告知",
	description: "10月31日まで作品を募集しています",
	publishFrom: "2026-10-01",
	publishUntil: "2026-10-31",
	consentVersion: CONSENT_VERSION,
});

const parse = (input: Record<string, unknown>) => PrAssetSubmitInputSchema.safeParse(input);

describe("PrAssetSubmitInputSchema", () => {
	test("正しい値を通す", () => {
		expect(parse(valid()).success).toBe(true);
	});

	test("descriptionとpublishUntilは省略できる。descriptionは空の文字列になる", () => {
		const { description: _d, publishUntil: _u, ...rest } = valid();
		const result = parse(rest);
		expect(result.success).toBe(true);
		expect(result.data?.description).toBe("");
		expect(result.data?.publishUntil).toBeUndefined();
	});

	test("知らない項目(submittedByなど)があれば弾く", () => {
		expect(parse({ ...valid(), submittedBy: "someone@fun.ac.jp" }).success).toBe(false);
		expect(parse({ ...valid(), status: "approved" }).success).toBe(false);
	});

	test("ファイルは10MBまで", () => {
		expect(parse({ ...valid(), file: jpeg(10 * 1024 * 1024) }).success).toBe(true);
		expect(parse({ ...valid(), file: jpeg(10 * 1024 * 1024 + 1) }).success).toBe(false);
	});

	test("ファイルの種類がJPEGとPNG以外なら弾く", () => {
		const webp = new File([new Uint8Array(10)], "photo.webp", { type: "image/webp" });
		expect(parse({ ...valid(), file: webp }).success).toBe(false);
	});

	test("ファイルでなく文字列が送られたら弾く", () => {
		expect(parse({ ...valid(), file: "photo.jpg" }).success).toBe(false);
	});

	test("タグは決まった値だけ", () => {
		expect(parse({ ...valid(), tag: "募集" }).success).toBe(true);
		expect(parse({ ...valid(), tag: "宣伝" }).success).toBe(false);
	});

	test("題名は前後の空白を除いて1〜30字", () => {
		expect(parse({ ...valid(), title: "あ".repeat(30) }).success).toBe(true);
		expect(parse({ ...valid(), title: "あ".repeat(31) }).success).toBe(false);
		expect(parse({ ...valid(), title: "" }).success).toBe(false);
		expect(parse({ ...valid(), title: "　 " }).success).toBe(false);
		expect(parse({ ...valid(), title: " 告知 " }).data?.title).toBe("告知");
	});

	test("説明は100字まで", () => {
		expect(parse({ ...valid(), description: "あ".repeat(100) }).success).toBe(true);
		expect(parse({ ...valid(), description: "あ".repeat(101) }).success).toBe(false);
	});

	test("日付はYYYY-MM-DDだけ", () => {
		expect(parse({ ...valid(), publishFrom: "2026/10/01" }).success).toBe(false);
		expect(parse({ ...valid(), publishFrom: "2026-10-01T00:00:00Z" }).success).toBe(false);
		expect(parse({ ...valid(), publishUntil: "2026-02-30" }).success).toBe(false);
	});

	test("終わりが始まりより前なら弾く。同じ日は通す", () => {
		expect(parse({ ...valid(), publishFrom: "2026-10-31", publishUntil: "2026-10-01" }).success).toBe(false);
		expect(parse({ ...valid(), publishFrom: "2026-10-31", publishUntil: "2026-10-31" }).success).toBe(true);
	});

	test("consentVersionが今の版と違えば弾く", () => {
		expect(parse({ ...valid(), consentVersion: "2000-01-v1" }).success).toBe(false);
		const { consentVersion: _c, ...rest } = valid();
		expect(parse(rest).success).toBe(false);
	});
});
