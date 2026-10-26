import { createLocalJWKSet, exportJWK, generateKeyPair, JWTPayload, KeyLike, SignJWT } from "jose";
import { createUserAuthMiddleware } from "../middlewares/user_auth";
import { DOMAIN_CLAIM, EMAIL_CLAIM } from "../schema/api/auth";

const ISSUER = "https://test-tenant.jp.auth0.com/";
const AUDIENCE = "https://fun-now-and-future/api";
const KID = "test-key";

// 認証の要るルートのテストで使う。手元で鍵を作り、その鍵で確かめるミドルウェアと、署名したトークンを作る
export const createTestAuth = async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256" };

  const sign = (claims: JWTPayload = {}, sub = "google-oauth2|1234567890", key: KeyLike = privateKey) =>
    new SignJWT({ [EMAIL_CLAIM]: "poster@fun.ac.jp", [DOMAIN_CLAIM]: "fun.ac.jp", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

  return {
    middleware: createUserAuthMiddleware(createLocalJWKSet({ keys: [jwk] }), ISSUER, AUDIENCE),
    sign,
  };
};
