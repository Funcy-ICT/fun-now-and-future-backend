import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "fun-now-and-future",
  });
}

export const db = getFirestore();