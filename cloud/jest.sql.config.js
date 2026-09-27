const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

// 本物のBigQueryで実行するテスト(*.sqltest.ts)。gcpの認証とテスト用のデータセットが要るので、npm testには含めない。
/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  testMatch: ["**/src/**/*.sqltest.ts"],
  maxWorkers: 1,
};
