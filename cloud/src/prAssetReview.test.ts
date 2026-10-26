import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as storageRepository from "./repositories/storage";
import { CONSENT_VERSION, PrAssetNotFoundError, PrAssetSchema, PrAssetStatusConflictError } from "./schema/pr_asset";
import { listPublishedPrAssets } from "./services/PublicRelations";
import { approvePrAsset, rejectPrAsset, revokePrAsset } from "./services/pr_asset_review";

const PRIVATE = "test-pr-assets-private";
const PUBLIC = "test-pr-assets-public";
const admin = { uid: "google-oauth2|admin", email: "admin@fun.ac.jp", permissions: ["review:pr-assets"] };
const poster = { uid: "google-oauth2|poster", email: "poster@fun.ac.jp", permissions: [] };
const other = { uid: "google-oauth2|other", email: "other@fun.ac.jp", permissions: [] };
const now = new Date("2026-10-26T03:00:00Z");

const docOf = (id: string) => getFirestore().collection("prAssets").doc(id);
const publicFile = (id: string) => getStorage().bucket(PUBLIC).file(`objects/${id}`);
const privateFile = (id: string) => getStorage().bucket(PRIVATE).file(`objects/${id}`);
const exists = async (file: ReturnType<typeof publicFile>) => (await file.exists())[0];
const readAsset = async (id: string) => PrAssetSchema.parse((await docOf(id).get()).data());

let ids: string[] = [];

// 投稿された状態(pending, 非公開のバケットに画像)を作る
const seed = async (id: string, status: "pending" | "approved" | "rejected" | "revoked" = "pending") => {
	ids.push(id);
	await privateFile(id).save(Buffer.from("image"), { contentType: "image/png", resumable: false });
	if (status === "approved") {
		await publicFile(id).save(Buffer.from("image"), { contentType: "image/png", resumable: false });
	}
	await docOf(id).set({
		id,
		status,
		tag: "お知らせ",
		title: "承認のテスト",
		description: "",
		contentType: "image/png",
		size: 5,
		publishFrom: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
		publishUntil: null,
		createdAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00Z")),
		submittedBy: { uid: poster.uid, email: poster.email },
		consent: { version: CONSENT_VERSION, agreedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00Z")) },
	});
};

describe("承認, 却下, 取り下げ", () => {
	const original = { private: process.env.PR_ASSET_PRIVATE_BUCKET, public: process.env.PR_ASSET_BUCKET };

	beforeAll(() => {
		process.env.PR_ASSET_PRIVATE_BUCKET = PRIVATE;
		process.env.PR_ASSET_BUCKET = PUBLIC;
	});

	afterEach(async () => {
		jest.restoreAllMocks();
		for (const id of ids) {
			await docOf(id).delete();
			await privateFile(id).delete({ ignoreNotFound: true });
			await publicFile(id).delete({ ignoreNotFound: true });
		}
		ids = [];
	});

	afterAll(() => {
		for (const [key, value] of [["PR_ASSET_PRIVATE_BUCKET", original.private], ["PR_ASSET_BUCKET", original.public]] as const) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	describe("approvePrAsset", () => {
		test("画像が公開バケットにコピーされ、approvedになり、一覧に出る", async () => {
			await seed("review-approve");

			await approvePrAsset("review-approve", admin, now);

			const asset = await readAsset("review-approve");
			expect(asset.status).toBe("approved");
			expect(asset.reviewedBy).toEqual({ uid: admin.uid, email: admin.email });
			expect(asset.reviewedAt?.toDate()).toEqual(now);
			const [meta] = await publicFile("review-approve").getMetadata();
			expect(meta.contentType).toBe("image/png");
			expect((await listPublishedPrAssets(now)).map(a => a.id)).toContain("review-approve");
		});

		test("pending以外は409にし、公開バケットに置かない", async () => {
			await seed("review-approve-rejected", "rejected");

			await expect(approvePrAsset("review-approve-rejected", admin, now)).rejects.toThrow(PrAssetStatusConflictError);
			expect(await exists(publicFile("review-approve-rejected"))).toBe(false);
		});

		test("無いidは、無いとして例外を投げる", async () => {
			await expect(approvePrAsset("review-missing", admin, now)).rejects.toThrow(PrAssetNotFoundError);
		});

		test("コピーの間に取り下げられたら、409にし、公開したファイルを消す", async () => {
			await seed("review-approve-race");
			const copy = storageRepository.copyPrAssetFileToPublic;
			jest.spyOn(storageRepository, "copyPrAssetFileToPublic").mockImplementationOnce(async (id) => {
				await copy(id);
				await docOf(id).update({ status: "revoked" });
			});

			await expect(approvePrAsset("review-approve-race", admin, now)).rejects.toThrow(PrAssetStatusConflictError);
			expect((await readAsset("review-approve-race")).status).toBe("revoked");
			expect(await exists(publicFile("review-approve-race"))).toBe(false);
		});

		test("コピーの間に別の承認が通っていたら、409にするが、公開したファイルは消さない", async () => {
			await seed("review-approve-twice");
			const copy = storageRepository.copyPrAssetFileToPublic;
			jest.spyOn(storageRepository, "copyPrAssetFileToPublic").mockImplementationOnce(async (id) => {
				await copy(id);
				await docOf(id).update({ status: "approved" });
			});

			await expect(approvePrAsset("review-approve-twice", admin, now)).rejects.toThrow(PrAssetStatusConflictError);
			expect(await exists(publicFile("review-approve-twice"))).toBe(true);
		});
	});

	describe("rejectPrAsset", () => {
		test("rejectedになり、理由が残る。公開バケットには置かない", async () => {
			await seed("review-reject");

			await rejectPrAsset("review-reject", admin, "写っている人の同意が分からないため", now);

			const asset = await readAsset("review-reject");
			expect(asset.status).toBe("rejected");
			expect(asset.reviewNote).toBe("写っている人の同意が分からないため");
			expect(asset.reviewedBy).toEqual({ uid: admin.uid, email: admin.email });
			expect(await exists(publicFile("review-reject"))).toBe(false);
		});

		test("理由が無ければ、reviewNoteを書かない", async () => {
			await seed("review-reject-no-note");

			await rejectPrAsset("review-reject-no-note", admin, undefined, now);

			expect((await docOf("review-reject-no-note").get()).data()).not.toHaveProperty("reviewNote");
		});

		test("承認済みは却下できない(409)", async () => {
			await seed("review-reject-approved", "approved");

			await expect(rejectPrAsset("review-reject-approved", admin, undefined, now)).rejects.toThrow(PrAssetStatusConflictError);
		});
	});

	describe("revokePrAsset", () => {
		test("管理者が承認済みを取り下げると、revokedになり、公開バケットの画像が消え、一覧に出ない", async () => {
			await seed("review-revoke-admin", "approved");

			await revokePrAsset("review-revoke-admin", { user: admin, role: "admin" }, now);

			const asset = await readAsset("review-revoke-admin");
			expect(asset.status).toBe("revoked");
			expect(asset.revokedBy).toEqual({ uid: admin.uid, email: admin.email, role: "admin" });
			expect(asset.revokedAt?.toDate()).toEqual(now);
			expect(await exists(publicFile("review-revoke-admin"))).toBe(false);
			expect((await listPublishedPrAssets(now)).map(a => a.id)).not.toContain("review-revoke-admin");
		});

		test("本人は、審査中の自分の投稿を取り下げられる", async () => {
			await seed("review-revoke-self");

			await revokePrAsset("review-revoke-self", { user: poster, role: "submitter" }, now);

			expect((await readAsset("review-revoke-self")).revokedBy?.role).toBe("submitter");
		});

		test("ほかの人の投稿は、状態にかかわらず、無いとして例外を投げる", async () => {
			await seed("review-revoke-other");
			await seed("review-revoke-other-rejected", "rejected");

			await expect(revokePrAsset("review-revoke-other", { user: other, role: "submitter" }, now)).rejects.toThrow(PrAssetNotFoundError);
			await expect(revokePrAsset("review-revoke-other-rejected", { user: other, role: "submitter" }, now)).rejects.toThrow(PrAssetNotFoundError);
			expect((await readAsset("review-revoke-other")).status).toBe("pending");
		});

		test("却下済みと取り下げ済みは、取り下げられない(409)", async () => {
			await seed("review-revoke-rejected", "rejected");
			await seed("review-revoke-revoked", "revoked");

			await expect(revokePrAsset("review-revoke-rejected", { user: admin, role: "admin" }, now)).rejects.toThrow(PrAssetStatusConflictError);
			await expect(revokePrAsset("review-revoke-revoked", { user: poster, role: "submitter" }, now)).rejects.toThrow(PrAssetStatusConflictError);
		});
	});
});
