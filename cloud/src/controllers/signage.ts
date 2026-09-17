import { Hono } from "hono";
import { z } from "zod";
import { getCongestionStatus } from "../services/congestion";
import { getCongestionHistoryStatus } from "../services/congestion";
import { listPublishedPrAssets } from "../services/PublicRelations";
import { signageAuthMiddleware } from "../middlewares/signage_auth";

const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required"),
});

const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export const congestionRoute = new Hono();

congestionRoute.get("/getCongestion", async (c) => {
  const parseResult = LocationQuerySchema.safeParse(c.req.query());
  if (!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }

  const status = await getCongestionStatus(parseResult.data.location);
  if (status === null) {
    return c.json({
      status: "error",
      message: "No data found",
    }, 404);
  }

  return c.json({
    status: "success",
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
