import { Hono } from "hono";
import { congestion } from "../services/congestion";
import { congestion_history } from "../services/congestion";


export const congestionRoute = new Hono();

congestionRoute.get("/getCongestion", async (c) => {
    return congestion(c);
})

congestionRoute.get("/getCongestionHistory", async (c) => {
    return congestion_history(c);
})