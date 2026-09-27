import { Hono } from "hono";
import { z } from "zod";
import { ScanEventSchema } from "../schema/scan_event";
import { savePendingScanEvent } from "../repositories/firestore";

// Pub/Subのプッシュサブスクリプションが送ってくる封筒。メッセージ本体はbase64で入っている。
const PushEnvelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().min(1),
  }),
});

export const pubsubPushRoute = new Hono();

// 認証はコードに書かない。処理側のCloud Runサービスを認証必須にして、呼び出せるのをPub/Subのサービスアカウントだけにする。
// 不正なメッセージには400を返す。再試行のあとデッドレターに入り、件数のアラートで気づける。ログにはメッセージの中身を出さない。
pubsubPushRoute.post("/pubsub/scan-events", async (c) => {
  const envelope = PushEnvelopeSchema.safeParse(await c.req.json().catch(() => null));
  if (!envelope.success) {
    console.error("Invalid pubsub push envelope:", envelope.error.issues);
    return c.json({ status: "error", message: "invalid envelope" }, 400);
  }

  const { data, messageId } = envelope.data.message;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
  } catch {
    console.error(`Pubsub message ${messageId} is not valid JSON.`);
    return c.json({ status: "error", message: "invalid message" }, 400);
  }

  const event = ScanEventSchema.safeParse(payload);
  if (!event.success) {
    console.error(`Pubsub message ${messageId} does not match ScanEventSchema:`, event.error.issues);
    return c.json({ status: "error", message: "invalid message" }, 400);
  }

  await savePendingScanEvent(event.data, messageId);
  return c.body(null, 204);
});
