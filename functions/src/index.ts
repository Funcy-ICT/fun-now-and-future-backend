import { onRequest } from "firebase-functions/v2/https";

//firebaseFunctions用のエクスポート
export const api = onRequest((req, res) => {
	const { app } = require("./app");
	return app.fetch(req as any, res as any);
});
