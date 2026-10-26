import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AuthVariables, userAuthMiddleware } from "../middlewares/user_auth";
import { ErrorResponseSchema } from "../schema/api/common";
import { PR_ASSET_MAX_FILE_BYTES, PrAssetSubmitInputSchema, PrAssetSubmitResponseSchema } from "../schema/api/pr_asset_submit";
import { InvalidPrAssetFileError } from "../services/pr_asset_file";
import { submitPrAsset } from "../services/pr_asset_submit";
import { PublishPeriodEndedError } from "../services/PublicRelations";

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
    });
};

export const prAssetRoute = createPrAssetRoute(userAuthMiddleware);
