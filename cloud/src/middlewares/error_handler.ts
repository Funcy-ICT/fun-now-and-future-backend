import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
	console.error(`[Error] ${c.req.method} ${c.req.url}:`, err);
	return c.json({
		error: "Internal Server Error",
		message: "予期せぬエラーが発生しました",
	},500);
};