import { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from "jose";
import { getAuth0Config } from "../lib/auth0";
import { AuthUser, EMAIL_CLAIM, UserClaimsSchema } from "../schema/api/auth";

export type AuthVariables = { user: AuthUser };

const unauthorized = (c: Context) => c.json({
  status: "error",
  message: "Unauthorized: Invalid or missing access token",
}, 401);

// テストでは手元で作った鍵を渡せるよう、鍵の取り方を引数にする
export const createUserAuthMiddleware = (getKey: JWTVerifyGetKey, issuer: string, audience: string) =>
  createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = c.req.header("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return unauthorized(c);

    let payload: unknown;
    try {
      //auth0はRS256で署名する。ほかのアルゴリズムは受け付けない。時計のずれは1分まで許す(funportと同じ)
      ({ payload } = await jwtVerify(token, getKey, { issuer, audience, algorithms: ["RS256"], clockTolerance: 60 }));
    } catch {
      return unauthorized(c);
    }

    const claims = UserClaimsSchema.safeParse(payload);
    if (!claims.success) return unauthorized(c);

    c.set("user", {
      uid: claims.data.sub,
      email: claims.data[EMAIL_CLAIM],
      permissions: claims.data.permissions,
    });
    return next();
  });

let jwks: JWTVerifyGetKey | undefined;

// appのルートに付ける。公開鍵はjoseがキャッシュし、知らない鍵のIDが来たときだけ取り直す
export const userAuthMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const { issuer, audience, jwksUrl } = getAuth0Config();
  jwks ??= createRemoteJWKSet(jwksUrl);
  return createUserAuthMiddleware(jwks, issuer, audience)(c, next);
});

// 管理のルートに、userAuthMiddlewareの後に付ける。権限はauth0のrbacで付ける
export const requirePermission = (permission: string) =>
  createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (!c.get("user").permissions.includes(permission)) {
      return c.json({ status: "error", message: "Forbidden: missing permission" }, 403);
    }
    return next();
  });
