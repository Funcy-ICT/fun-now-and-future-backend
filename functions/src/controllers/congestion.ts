import { getLatestSensorData } from "../repositories/firestore";
import { getSensorDataHistory } from "../repositories/firestore";
import { calculateCongestionStatus } from "../services/congestion";
import { Hono } from "hono";
import { z } from "zod";


export const congestionRoute = new Hono();

export const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required"),
});

export const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

congestionRoute.get("/getCongestion", async (c) => {
    const parseResult = LocationQuerySchema.safeParse(await c.req.query());
  if(!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }
  // 直近の混雑状況を取得する関数はリポジトリ層に移動しました。
  // functions/src/repositories/firestore.tsのgetLatestSensorData関数に書いてあります。
  //ここで、リポジトリ層のgetLatestSensorData関数を呼び出して、最新のセンサーデータを取得します。
  const snapshot = await getLatestSensorData(parseResult.data.location);
  
  if(snapshot.empty) {
   return c.json({
      status: "error",
      message: "No data found",
    }, 404);
  }


  const data = snapshot.docs[0].data();
  const congestionInfo = calculateCongestionStatus(data.ble_device_count);

  return c.json({
    status: "success",
    data: {
      ...data,
      congestion_level: congestionInfo.level,
      congestion_label: congestionInfo.label,
    }
  }, 200); 
}
);

congestionRoute.get("/getCongestionHistory", async (c) => {
  const parseResult = HistoryQuerySchema.safeParse(await c.req.query());
  if(!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }

	//const { location, limit } = parseResult.data;

    // 直近の混雑状況を取得する関数はリポジトリ層に移動しました。 
    // functions/src/repositories/firestore.tsのgetSensorDataHistory関数に書いてあります。
    //ここで、リポジトリ層のgetSensorDataHistory関数を呼び出して、指定された場所のセンサーデータ履歴を取得します。
    const snapshot = await getSensorDataHistory(parseResult.data.location, parseResult.data.limit);

  if (snapshot.empty) {
    return c.json({
      status: "error",
      message: "No history data found",
    }, 404);
  }

  const history = snapshot.docs.map((doc: any) => {
    const data = doc.data();
    const congestionInfo = calculateCongestionStatus(data.ble_device_count);
    return {
      ...data,
      congestion_level: congestionInfo.level,
      congestion_label: congestionInfo.label,
    };
  });

  return c.json({
    status: "success",
    count: history.length,
    data: history,
  }, 200);
});