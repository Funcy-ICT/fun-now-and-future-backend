import { app } from "./app";
import { onRequest } from "firebase-functions/v2/https";

//firebaseFunctions用のエクスポート
export const api = onRequest((req, res) => {
  app.fetch(req as any, res as any);
});
//テストなどのためのエクスポート
export default app;