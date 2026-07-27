import { Hono } from "hono";
import { z } from "zod";
// import { db } from "../lib/firebase";";
import { getLatestSensorData } from "../repositories/firestore";
import { getSensorDataHistory } from "../repositories/firestore";

export const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required"),
});

export const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});


export function calculateCongestionStatus(count: number):  {level: string; label: string} {
  if(count >= 50) {
    return {level: "high", label: "混雑"};
  }else if (count >= 20) {
    return {level: "medium", label: "やや混雑"};
  } else {
    return {level: "low", label: "空いている"};
  }
}

export const congestionRoute = new Hono();

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
  const snapshot = await getLatestSensorData();
  
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

//   const { location, limit } = parseResult.data;

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

  const history = snapshot.docs.map(doc => {
    const data = doc.data();
    const congestionInfo = calculateCongestionStatus(data.ble_device_count);
    return {
      ...data,
      congestion_level: congestionInfo.level,
      congestion_label: congestionInfo.label,
    };
  }
);

  return c.json({
    status: "success",
    count: history.length,
    data: history,
  }, 200);
}
);