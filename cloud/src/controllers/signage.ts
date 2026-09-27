import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { getCongestionStatus } from "../services/congestion";
import { getCongestionHistoryStatus } from "../services/congestion";
import { listPublishedPrAssets } from "../services/PublicRelations";
import { signageAuthMiddleware } from "../middlewares/signage_auth";
import { CongestionResponseSchema, HistoryQuerySchema, LocationQuerySchema } from "../schema/api/signage";
import { ErrorResponseSchema } from "../schema/api/common";

// swaggerの定義から、リクエストの検証とレスポンスの型が決まる。検証に失敗したときは、これまでと同じ形の400を返す
export const congestionRoute = new OpenAPIHono({
  defaultHook: (result, c) =>
    result.success ? undefined : c.json({ status: "error" as const, message: result.error.issues[0].message }, 400),
});

const jsonContent = <T,>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const getCongestionRoute = createRoute({
  method: "get",
  path: "/getCongestion",
  summary: "指定したlocationの最新の混雑度",
  request: { query: LocationQuerySchema },
  responses: {
    200: jsonContent(CongestionResponseSchema, "最新の混雑度"),
    400: jsonContent(ErrorResponseSchema, "クエリが不正"),
    404: jsonContent(ErrorResponseSchema, "該当するデータが無い"),
  },
});

congestionRoute.openapi(getCongestionRoute, async (c) => {
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

congestionRoute.get("/getCongestionHistory", async (c) => {
  const parseResult = HistoryQuerySchema.safeParse(c.req.query());
  if (!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }

  const history = await getCongestionHistoryStatus(parseResult.data.location, parseResult.data.limit);
  if (history.length === 0) {
    return c.json({
      status: "error",
      message: "No history data found",
    }, 404);
  }

  return c.json({
    status: "success",
    count: history.length,
    data: history,
  }, 200);
})

congestionRoute.get("/signage/assets", signageAuthMiddleware, async (c) => {
  const assets = await listPublishedPrAssets();
  return c.json({ assets });
});
