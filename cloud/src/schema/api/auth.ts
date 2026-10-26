import { z } from "zod";

// auth0のPost-Login Actionで、アクセストークンに足すクレームの名前空間。Actionと同じ値にする
export const CLAIM_NS = "https://fun-now-and-future/";
export const EMAIL_CLAIM = `${CLAIM_NS}email` as const;
export const DOMAIN_CLAIM = `${CLAIM_NS}domain` as const;

// 大学のGoogle Workspaceのドメイン。Googleの同意画面とActionでも確かめるが、
// auth0の設定を間違えても学外の人が通らないよう、ここでも確かめる
export const UNIVERSITY_DOMAIN = "fun.ac.jp";

// joseは署名, iss, aud, 期限を確かめるが、中身の形は確かめないので、使うクレームをここで確かめる
export const UserClaimsSchema = z.object({
  sub: z.string().min(1, "sub is required"),
  [EMAIL_CLAIM]: z.email(),
  [DOMAIN_CLAIM]: z.literal(UNIVERSITY_DOMAIN),
  // rbacの権限。投稿する人には付かない
  permissions: z.array(z.string()).default([]),
});

// 後ろの処理に渡す、ログインしている人
export type AuthUser = {
  uid: string;
  email: string;
  permissions: string[];
};
