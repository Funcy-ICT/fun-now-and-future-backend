// auth0のテナントの設定。appのサービスでは、未設定のままデプロイされると、どのリクエストも401になるので、起動時に確かめる
export type Auth0Config = {
  issuer: string;
  audience: string;
  jwksUrl: URL;
};

export const getAuth0Config = (): Auth0Config => {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  if (!domain) {
    throw new Error("AUTH0_DOMAIN is not set");
  }
  if (!audience) {
    throw new Error("AUTH0_AUDIENCE is not set");
  }
  return {
    issuer: `https://${domain}/`,
    audience,
    jwksUrl: new URL(`https://${domain}/.well-known/jwks.json`),
  };
};
