import sharp from "sharp";
import { getStorage } from "firebase-admin/storage";
import { savePrivatePrAssetFile } from "./repositories/storage";
import { processPrAssetFile } from "./services/pr_asset_file";

describe("savePrivatePrAssetFile", () => {
	const original = process.env.PR_ASSET_PRIVATE_BUCKET;
	const bucketName = "test-pr-assets-private";

	beforeEach(() => {
		process.env.PR_ASSET_PRIVATE_BUCKET = bucketName;
	});

	afterAll(() => {
		if (original === undefined) {
			delete process.env.PR_ASSET_PRIVATE_BUCKET;
		} else {
			process.env.PR_ASSET_PRIVATE_BUCKET = original;
		}
	});

	test("EXIFを消した画像が、非公開のバケットのobjects/{id}に、種類付きで置かれる", async () => {
		const input = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#3366cc" } })
			.jpeg()
			.withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 50/1 0/1" } })
			.toBuffer();
		const processed = await processPrAssetFile(input);
		const file = getStorage().bucket(bucketName).file("objects/storage-test-1");

		try {
			await savePrivatePrAssetFile("storage-test-1", processed.data, processed.contentType);

			const [metadata] = await file.getMetadata();
			expect(metadata.contentType).toBe("image/jpeg");
			const [saved] = await file.download();
			expect(saved.equals(processed.data)).toBe(true);
			expect((await sharp(saved).metadata()).exif).toBeUndefined();
		} finally {
			await file.delete({ ignoreNotFound: true });
		}
	});

	test("PR_ASSET_PRIVATE_BUCKETが未設定なら例外を投げる", async () => {
		delete process.env.PR_ASSET_PRIVATE_BUCKET;

		await expect(savePrivatePrAssetFile("storage-test-2", Buffer.from("x"), "image/png"))
			.rejects.toThrow("PR_ASSET_PRIVATE_BUCKET is not set");
	});
});
