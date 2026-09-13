import { Hono } from "hono";
import { congestion } from "../services/congestion";
import { congestion_history } from "../services/congestion";
import { listPublishedPrAssets } from "../services/PublicRelations";
import { signageAuthMiddleware } from "../middlewares/signage_auth";

export const congestionRoute = new Hono();

congestionRoute.get("/getCongestion", async (c) => {
    return congestion(c);
})

congestionRoute.get("/getCongestionHistory", async (c) => {
    return congestion_history(c);
})

congestionRoute.get("/signage/assets", signageAuthMiddleware, async (c) => {
  const assets = await listPublishedPrAssets();
  return c.json({ assets });
});