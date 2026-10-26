// appのサービスを呼べる画面のオリジン(投稿画面と管理画面。Firebase Hostingのweb.appとfirebaseapp.comの両方)。カンマ区切り。
// 末尾の/やパスを付けると一致しないので、オリジンの形でなければ例外を投げる
export const getAppAllowedOrigins = (): string[] => {
  const raw = process.env.APP_ALLOWED_ORIGINS;
  if (!raw) {
    throw new Error("APP_ALLOWED_ORIGINS is not set");
  }
  const origins = raw.split(",").map(origin => origin.trim()).filter(origin => origin !== "");
  for (const origin of origins) {
    if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
      throw new Error(`APP_ALLOWED_ORIGINS has an invalid origin: ${origin}`);
    }
  }
  return origins;
};
