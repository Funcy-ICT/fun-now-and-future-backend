/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { getRequestListener } from "@hono/node-server"
import { sensorRoute } from "./controllers/sensor";
import { congestionRoute } from "./services/congestion";


// FirebaseからのパスをHono側の想定パスに書き換えてfetchに渡す共通処理
function toFixedPathListener(hono: { fetch: typeof Request.prototype extends never ? never : any }, fixedPath: string) {
  return getRequestListener(async (req: Request) => {
    const url = new URL(req.url);
    url.pathname = fixedPath;
    const rewritten = new Request(url.toString(), req);
    return hono.fetch(rewritten);
  });
}

export const receiveSensorData = onRequest(
  toFixedPathListener(sensorRoute, "/receiveSensorData")
);
export const getCongestion = onRequest(
  toFixedPathListener(congestionRoute, "/getCongestion")
);
export const getCongestionHistory = onRequest(
  toFixedPathListener(congestionRoute, "/getCongestionHistory")
);


// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

export const health = onRequest((req, res) => {
  logger.info("health endpoint called");

  res.json({
    status: "ok",
    message: "Backend is running",
  });
});

/*
受け取ったら入力チェックして、オウム返しした後データベースに保存
curl -X POST http://127.0.0.1:5001/fun-now-and-future/us-central1/receiveSensorData -H "Content-Type: application/json" -d "{\"sensor_id\": \"esp32_ryoHasegawa_99\", \"location\": \"sapporo\", \"ble_device_count\": 999}"
{"status":"success","message":"Data received successfully","received_at":"2026-07-13T08:58:29.018Z","data":{"sensor_id":"esp32_ryoHasegawa_99","location":"sapporo","ble_device_count":999}}
*/


export const getAnnouncements = onRequest(async (req, res) => {

});