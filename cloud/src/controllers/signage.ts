import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { getCongestionStatus } from "../services/congestion";
import { getCongestionHistoryStatus } from "../services/congestion";
import { listPublishedPrAssets } from "../services/PublicRelations";
import { signageAuthMiddleware } from "../middlewares/signage_auth";
import { CongestionHistoryResponseSchema, CongestionResponseSchema, HistoryQuerySchema, LocationQuerySchema, SignageAssetsResponseSchema } from "../schema/api/signage";
import { ErrorResponseSchema } from "../schema/api/common";

const jsonContent = <T,>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const getCongestionRoute = createRoute({
  method: "get",
  path: "/getCongestion",
  summary: "指定したlocationの最新の混雑度",
  description: "levelの意味と、levelがnullのときの読み方は、CongestionStatusの各項目の説明を参照",
  request: { query: LocationQuerySchema },
  responses: {
    200: jsonContent(CongestionResponseSchema, "最新の混雑度"),
    400: jsonContent(ErrorResponseSchema, "クエリが不正"),
    404: jsonContent(ErrorResponseSchema, "該当するデータが無い"),
  },
});

const getCongestionHistoryRoute = createRoute({
  method: "get",
  path: "/getCongestionHistory",
  summary: "指定したlocationの混雑度の履歴(新しい順)",
  description: "履歴の各要素にstaleは含まれない。過去のデータに対して、同じ意味を持たないため",
  request: { query: HistoryQuerySchema },
  responses: {
    200: jsonContent(CongestionHistoryResponseSchema, "混雑度の履歴"),
    400: jsonContent(ErrorResponseSchema, "クエリが不正"),
    404: jsonContent(ErrorResponseSchema, "該当するデータが無い"),
  },
});

// APIキーの確認はmiddlewareで行う。クエリやボディの検証より先に動くので、キーが無ければ401を返す
const getSignageAssetsRoute = createRoute({
  method: "get",
  path: "/signage/assets",
  summary: "掲載中の広報アセットの一覧",
  description: "掲載期間内のアセットだけを返す(statusがapprovedで、publishFromからpublishUntilまでの間。"
    + "publishUntilがnullなら無期限)。実体は返さず、公開バケット上のURLを返す。"
    + "投稿と承認の手段はまだ無く、Firestoreのコンソールとgcloud storage cpで手で入れる",
  middleware: [signageAuthMiddleware] as const,
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: jsonContent(SignageAssetsResponseSchema, "掲載中の広報アセット"),
    401: jsonContent(ErrorResponseSchema, "APIキーが無い、または違う"),
  },
});

// swaggerの定義から、リクエストの検証とレスポンスの型が決まる。検証に失敗したときは、これまでと同じ形の400を返す
// hono rpcでルートの型が残るよう、ハンドラーはメソッドチェーンでつなぐ
export const congestionRoute = new OpenAPIHono({
  defaultHook: (result, c) =>
    result.success ? undefined : c.json({ status: "error" as const, message: result.error.issues[0].message }, 400),
})
  .openapi(getCongestionRoute, async (c) => {
    const { location } = c.req.valid("query");

    const status = await getCongestionStatus(location);
    if (status === null) {
      return c.json({
        status: "error" as const,
        message: "No data found",
      }, 404);
    }

    return c.json({
      status: "success" as const,
      data: status,
    }, 200);
  })
  .openapi(getCongestionHistoryRoute, async (c) => {
    const { location, limit } = c.req.valid("query");

    const history = await getCongestionHistoryStatus(location, limit);
    if (history.length === 0) {
      return c.json({
        status: "error" as const,
        message: "No history data found",
      }, 404);
    }

    return c.json({
      status: "success" as const,
      count: history.length,
      data: history,
    }, 200);
  })
  .openapi(getSignageAssetsRoute, async (c) => {
    const assets = await listPublishedPrAssets();
    return c.json({ assets }, 200);
  });
