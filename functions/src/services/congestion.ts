// import { db } from "../lib/firebase";";


export function calculateCongestionStatus(count: number):  {level: string; label: string} {
  if(count >= 50) {
    return {level: "high", label: "混雑"};
  }else if (count >= 20) {
    return {level: "medium", label: "やや混雑"};
  } else {
    return {level: "low", label: "空いている"};
  }
}



