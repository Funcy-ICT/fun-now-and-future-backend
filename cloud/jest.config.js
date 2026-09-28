const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  testMatch: ["**/src/**/*.test.ts"],
  // 認証のあるルートのテスト用に、APIキーを環境変数に入れる
  setupFiles: ["<rootDir>/src/testing/setup_env.ts"],
  // テストは1つのFirestoreエミュレータを共有する。pending_scansのように、コレクション全体を時刻で読み書き・削除するテストがあり、
  // 並列に動かすと、別のファイルのドキュメントを消し合って、たまに落ちる。
  maxWorkers: 1,
};