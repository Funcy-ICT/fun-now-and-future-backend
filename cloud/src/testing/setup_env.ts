import { TEST_API_KEY } from "./api_key";

// すべてのテストファイルの前に動く。認証のあるルートを呼ぶテストが、同じキーを使えるようにする
process.env.ESP32_API_KEY = TEST_API_KEY;
