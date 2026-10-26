import sharp from "sharp";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as firestoreRepository from "./repositories/firestore";
import { CONSENT_VERSION, PrAssetSchema } from "./schema/pr_asset";
import { PrAssetSubmitInput } from "./schema/api/pr_asset_submit";
import { InvalidPrAssetFileError } from "./services/pr_asset_file";
import { PublishPeriodEndedError } from "./services/PublicRelations";
import { submitPrAsset } from "./services/pr_asset_submit";

const BUCKET = "test-pr-assets-private";
const user = { uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp", permissions: [] };
const now = new Date("2026-10-26T03:00:00Z");

const photo = async () => {
	const data = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#3366cc" } })
		.jpeg()
		.withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 50/1 0/1" } })
		.toBuffer();
	return new File([new Uint8Array(data)], "photo.jpg", { type: "image/jpeg" });
};

const input = async (overrides: Partial<PrAssetSubmitInput> = {}): Promise<PrAssetSubmitInput> => ({
	file: await photo(),
	tag: "イベント",
	title: "秋のコンテスト告知",
	description: "10月31日まで作品を募集しています",
	publishFrom: "2026-10-01",
	publishUntil: "2026-10-31",
	consentVersion: CONSENT_VERSION,
	...overrides,
});

const fileOf = (id: string) => getStorage().bucket(BUCKET).file(`objects/${id}`);
const countDocs = async () => (await getFirestore().collection("prAssets").count().get()).data().count;
const countFiles = async () => (await getStorage().bucket(BUCKET).getFiles({ prefix: "objects/" }))[0].length;

describe("submitPrAsset", () => {
	const original = process.env.PR_ASSET_PRIVATE_BUCKET;

	beforeAll(() => {
		process.env.PR_ASSET_PRIVATE_BUCKET = BUCKET;
	});

	afterAll(() => {
		if (original === undefined) {
			delete process.env.PR_ASSET_PRIVATE_BUCKET;
		} else {
			process.env.PR_ASSET_PRIVATE_BUCKET = original;
		}
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test("pendingのドキュメントと、EXIFを消した画像が置かれる", async () => {
		const result = await submitPrAsset(await input(), user, now);

		try {
			expect(result.status).toBe("pending");
			const doc = await getFirestore().collection("prAssets").doc(result.id).get();
			const asset = PrAssetSchema.parse(doc.data());
			expect(asset).toMatchObject({
				id: result.id,
				status: "pending",
				tag: "イベント",
				title: "秋のコンテスト告知",
				contentType: "image/jpeg",
				submittedBy: { uid: "google-oauth2|1234567890", email: "poster@fun.ac.jp" },
				consent: { version: CONSENT_VERSION },
			});
			expect(asset.publishFrom.toDate().toISOString()).toBe("2026-09-30T15:00:00.000Z");
			expect(asset.publishUntil?.toDate().toISOString()).toBe("2026-10-31T14:59:59.000Z");
			expect(asset.createdAt.toDate()).toEqual(now);
			expect(asset.consent.agreedAt.toDate()).toEqual(now);

			const [saved] = await fileOf(result.id).download();
			expect(asset.size).toBe(saved.length);
			expect((await sharp(saved).metadata()).exif).toBeUndefined();
		} finally {
			await getFirestore().collection("prAssets").doc(result.id).delete();
			await fileOf(result.id).delete({ ignoreNotFound: true });
		}
	});

	test("終わりが今日より前なら、何も置かずに例外を投げる", async () => {
		const [docs, files] = [await countDocs(), await countFiles()];

		await expect(submitPrAsset(await input({ publishUntil: "2026-10-25" }), user, now)).rejects.toThrow(PublishPeriodEndedError);

		expect(await countDocs()).toBe(docs);
		expect(await countFiles()).toBe(files);
	});

	test("画像として読めなければ、何も置かずに例外を投げる", async () => {
		const [docs, files] = [await countDocs(), await countFiles()];
		const broken = new File([new TextEncoder().encode("not an image")], "photo.jpg", { type: "image/jpeg" });

		await expect(submitPrAsset(await input({ file: broken }), user, now)).rejects.toThrow(InvalidPrAssetFileError);

		expect(await countDocs()).toBe(docs);
		expect(await countFiles()).toBe(files);
	});

	test("ドキュメントの保存に失敗したら、置いた画像を消す", async () => {
		const files = await countFiles();
		jest.spyOn(firestoreRepository, "createPrAsset").mockRejectedValueOnce(new Error("firestore is down"));

		await expect(submitPrAsset(await input(), user, now)).rejects.toThrow("firestore is down");

		expect(await countFiles()).toBe(files);
	});
});
