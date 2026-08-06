import { onRequest } from "firebase-functions/v2/https";
import app from "./app";
import { getRequestListener } from "@hono/node-server";

const listener = getRequestListener(app.fetch);

export const api = onRequest((req: any, res: any) => {
  return listener(req, res);
});