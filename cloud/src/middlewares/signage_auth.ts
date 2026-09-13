import { MiddlewareHandler } from "hono";
import { sensorAuthMiddleware } from "./sensor_auth";

export const signageAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header("x-api-key");
  const authResult = await sensorAuthMiddleware(apiKey);
  if (authResult === 0) {
    return c.json({
      status: "error",
      message: "Unauthorized: Invalid or missing API Key",
    }, 401);
  }
  await next();
};