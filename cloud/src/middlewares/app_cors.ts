import { cors } from "hono/cors";
import { getAppAllowedOrigins } from "../lib/app_origins";

// 許したオリジンにだけAccess-Control-Allow-Originを付ける。ほかのオリジンには付けないので、ブラウザが応答を読ませない。
// トークンはAuthorizationヘッダーで送り、クッキーは使わないので、credentialsは許さない。
// ローカル(SERVICE_ROLEが未設定)でAPP_ALLOWED_ORIGINSが無いときは、どのオリジンも許さない。appでは起動時に確かめる
export const appCorsMiddleware = cors({
  origin: (origin) => {
    const allowed = process.env.APP_ALLOWED_ORIGINS ? getAppAllowedOrigins() : [];
    return allowed.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST"],
  allowHeaders: ["Authorization", "Content-Type"],
  maxAge: 600,
});
