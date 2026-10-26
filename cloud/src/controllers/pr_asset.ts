import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AuthVariables, userAuthMiddleware } from "../middlewares/user_auth";
import { ErrorResponseSchema } from "../schema/api/common";
import { PR_ASSET_MAX_FILE_BYTES, PrAssetSubmitInputSchema, PrAssetSubmitResponseSchema } from "../schema/api/pr_asset_submit";
import { InvalidPrAssetFileError } from "../services/pr_asset_file";
import { submitPrAsset } from "../services/pr_asset_submit";
import { PublishPeriodEndedError } from "../services/PublicRelations";
import { MyPrAssetsResponseSchema, PrAssetIdParamSchema, WithdrawPrAssetResponseSchema } from "../schema/api/my_pr_assets";
import { PrAssetNotFoundError, PrAssetStatusConflictError } from "../schema/pr_asset";
import { listMyPrAssets } from "../services/my_pr_assets";
import { revokePrAsset } from "../services/pr_asset_review";

// exampleはルートごとに書く。エラーは共通のスキーマで、無いとmessageが"string"としか出ないため
const jsonContent = <T,>(schema: T, description: string, example?: unknown) => ({
  content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } },
  description,
});

// 画像の上限に、ほかの項目とmultipartの区切りの分を足す。画像の上限そのものは、スキーマで確かめる
const BODY_LIMIT_BYTES = PR_ASSET_MAX_FILE_BYTES + 1024 * 1024;

type AuthMiddleware = MiddlewareHandler<{ Variables: AuthVariables }>;

// テストで手元の鍵を使えるよう、認証のミドルウェアを引数にする
export const createPrAssetRoute = (auth: AuthMiddleware) => {
  // 認証を先に通す。トークンが無ければ、本文を読まずに401を返す
  const submitPrAssetRoute = createRoute({
    method: "post",
    path: "/pr-assets",
    summary: "広報アセットを投稿する",
    description: "投稿は審査待ち(pending)で入り、承認されるまでサイネージには出ない。"
      + "投稿した人はアクセストークンから取るので、本文には入れない(知らない項目があれば400)。"
      + "無期限にするときは、publishUntilを送らない",
    middleware: [
      auth,
      bodyLimit({
        maxSize: BODY_LIMIT_BYTES,
        onError: (c) => c.json({ status: "error" as const, message: "Payload Too Large" }, 413),
      }),
    ] as const,
    security: [{ BearerAuth: [] }],
    request: {
      body: { content: { "multipart/form-data": { schema: PrAssetSubmitInputSchema } }, required: true },
    },
    responses: {
      201: jsonContent(PrAssetSubmitResponseSchema, "受け付けた(審査待ち)"),
      400: jsonContent(ErrorResponseSchema, "本文が不正、画像として読めない、または掲載の終わりが今日より前", {
        status: "error",
        message: "consentVersion is outdated. reload the page",
      }),
      401: jsonContent(ErrorResponseSchema, "アクセストークンが無い、または違う", {
        status: "error",
        message: "Unauthorized: Invalid or missing access token",
      }),
      413: jsonContent(ErrorResponseSchema, "本文が大きすぎる", { status: "error", message: "Payload Too Large" }),
    },
  });

  const listMyPrAssetsRoute = createRoute({
    method: "get",
    path: "/pr-assets/mine",
    summary: "自分の投稿の一覧(新しい順)",
    description: "投稿した人のダッシュボードに出す。審査の状態と、却下の理由を返す。画像は返さない",
    middleware: [auth] as const,
    security: [{ BearerAuth: [] }],
    responses: {
      200: jsonContent(MyPrAssetsResponseSchema, "自分の投稿"),
      401: jsonContent(ErrorResponseSchema, "アクセストークンが無い、または違う", {
        status: "error",
        message: "Unauthorized: Invalid or missing access token",
      }),
    },
  });

  const withdrawPrAssetRoute = createRoute({
    method: "post",
    path: "/pr-assets/{id}/withdraw",
    summary: "自分の投稿を取り下げる",
    description: "審査中か承認済みの自分の投稿を取り下げる。承認済みなら、サイネージから外れる。"
      + "ほかの人の投稿は、あることを知らせないよう404にする。直すときは、取り下げて投稿し直す",
    middleware: [auth] as const,
    security: [{ BearerAuth: [] }],
    request: { params: PrAssetIdParamSchema },
    responses: {
      200: jsonContent(WithdrawPrAssetResponseSchema, "取り下げた"),
      401: jsonContent(ErrorResponseSchema, "アクセストークンが無い、または違う", {
        status: "error",
        message: "Unauthorized: Invalid or missing access token",
      }),
      404: jsonContent(ErrorResponseSchema, "自分の投稿に無い", { status: "error", message: "Not found" }),
      409: jsonContent(ErrorResponseSchema, "却下済みか取り下げ済みで、取り下げられない", {
        status: "error",
        message: "prAsset status is rejected",
      }),
    },
  });

  // 検証に失敗したときは、ほかのルートと同じ形の400を返す
  return new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json({ status: "error" as const, message: result.error.issues[0].message }, 400),
  })
    .openapi(submitPrAssetRoute, async (c) => {
      try {
        const result = await submitPrAsset(c.req.valid("form"), c.get("user"));
        return c.json(result, 201);
      } catch (err) {
        if (err instanceof PublishPeriodEndedError || err instanceof InvalidPrAssetFileError) {
          return c.json({ status: "error" as const, message: err.message }, 400);
        }
        throw err;
      }
    })
    .openapi(listMyPrAssetsRoute, async (c) => {
      const assets = await listMyPrAssets(c.get("user").uid);
      return c.json({ assets }, 200);
    })
    .openapi(withdrawPrAssetRoute, async (c) => {
      const { id } = c.req.valid("param");
      try {
        await revokePrAsset(id, { user: c.get("user"), role: "submitter" });
        return c.json({ id, status: "revoked" as const }, 200);
      } catch (err) {
        if (err instanceof PrAssetNotFoundError) {
          return c.json({ status: "error" as const, message: "Not found" }, 404);
        }
        if (err instanceof PrAssetStatusConflictError) {
          return c.json({ status: "error" as const, message: err.message }, 409);
        }
        throw err;
      }
    });
};

export const prAssetRoute = createPrAssetRoute(userAuthMiddleware);
