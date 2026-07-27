import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/firebase";


const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required"),
});

const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});


function calculateCongestionStatus(count: number):  {level: string; label: string} {
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

  const {location} = parseResult.data;

	const snapshot = await db.collection("sensorData")
		.where("location", "==", location)
    .orderBy("received_at", "desc")
		.limit(1)
		.get();

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
    data: {...data,
      congestion_level: congestionInfo.level,
      congestion_label: congestionInfo.label,
    }
  }, 200);
});

congestionRoute.get("/getCongestionHistory", async (c) => {
  const parseResult = HistoryQuerySchema.safeParse(await c.req.query());
  if(!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }

  const { location, limit } = parseResult.data;

  const snapshot = await db.collection("sensorData")
    .where("location", "==", location)
    .orderBy("received_at", "desc")
    .limit(limit)
    .get();

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
  });

  return c.json({
    status: "success",
    count: history.length,
    data: history,
  }, 200);
});