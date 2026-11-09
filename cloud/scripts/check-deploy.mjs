// デプロイしたingest、worker、appが、想定どおりに動いているかを確かめる。手順はdocs/deploy.md。
// macとWindowsのどちらでも動くよう、Node.jsの標準の機能とgcloudだけを使う。依存するパッケージは無い。
//
// 使い方(先にgcloud auth loginを済ませる。どのディレクトリからでも実行できる):
//   node cloud/scripts/check-deploy.mjs         ingestとworkerの設定、ルートの有無、認証、Firestoreの読み出しを確かめる。データは書かない
//   node cloud/scripts/check-deploy.mjs --send  加えて、テストのデータを1件送り、集計されて/getCongestionに出るまで待つ(最大10分)
//   node cloud/scripts/check-deploy.mjs --app   加えて、appとバケットの設定、ルートの有無、認証、CORSを確かめる
//
// 確かめる先のURLは、Cloud Runの決まった形(https://サービス名-プロジェクト番号.リージョン.run.app)から作る。
// 別の場所を試すときは、環境変数INGEST_URL、WORKER_URL、APP_URLで上書きする
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const PROJECT = "funcy2022";
const PROJECT_NUMBER = "638313186296";
const REGION = "asia-northeast1";
const urlOf = (service) => process.env[`${service.toUpperCase()}_URL`] ?? `https://${service}-${PROJECT_NUMBER}.${REGION}.run.app`;
const SA = (name) => `${name}@${PROJECT}.iam.gserviceaccount.com`;
// docs/deploy.mdで作るバケットと同じ名前にする
const PUBLIC_BUCKET = "funcy2022-fnaf-pr-assets";
const PRIVATE_BUCKET = "funcy2022-fnaf-pr-assets-private";

// テストのデータのlocationとnodeId。本物のlocationと混ざらない名前にする
const TEST_LOCATION = "deploy_check";
const WINDOW_MS = 5 * 60 * 1000;
// 受信した窓が閉じてから60秒後の集計(毎時1分から5分ごと)を待つので、最長でおよそ6分かかる
const SEND_WAIT_MS = 10 * 60 * 1000;

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? "OK" : "NG"}  ${label}${detail === undefined ? "" : `  (${detail})`}`);
  if (!ok) failures++;
};

// APIキーとトークンを画面に出さないよう、gcloudの出力は受け取るだけにする。gcloudのエラーはそのまま出す
const gcloud = (args) => execSync(`gcloud ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

// コールドスタートで最初の応答が遅れることがあるので、30秒まで待つ
const call = async (base, method, path, { headers = {}, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Cloud Runが返す403などは、JSONではない
  }
  return { status: res.status, headers: res.headers, json };
};

// --service-accountを付け忘れると、編集者のロールを持つ既定のサービスアカウントで動いてしまうので、設定も確かめる
const checkService = (service, { sa, env, isPublic }) => {
  console.log(`\n== ${service}の設定`);
  const desc = JSON.parse(gcloud(`run services describe ${service} --project=${PROJECT} --region=${REGION} --format=json`));
  const spec = desc.spec.template.spec;
  check(spec.serviceAccountName === SA(sa), `サービスアカウントが${SA(sa)}`, spec.serviceAccountName);

  const actual = Object.fromEntries((spec.containers[0].env ?? []).map(e => [e.name, e.value ?? "(シークレット)"]));
  for (const [name, value] of Object.entries(env)) {
    check(actual[name] === value, `環境変数${name}が${value}`, actual[name] ?? "未設定");
  }

  const policy = JSON.parse(gcloud(`run services get-iam-policy ${service} --project=${PROJECT} --region=${REGION} --format=json`));
  const invokers = (policy.bindings ?? []).filter(b => b.role === "roles/run.invoker").flatMap(b => b.members);
  check(invokers.includes("allUsers") === isPublic, isPublic ? "誰でも呼べる(allUsers)" : "allUsersが呼べない(認証必須)", invokers.join(", ") || "なし");
  return { env: actual, invokers };
};

// 公開バケットは、名前を知っているものだけを誰でも読める。一覧は見せない(ADR 0006)。非公開のバケットは、誰にも公開しない
const checkBuckets = () => {
  console.log("\n== バケット");
  const membersOf = (bucket) => {
    const policy = JSON.parse(gcloud(`storage buckets get-iam-policy gs://${bucket} --format=json`));
    return (role) => (policy.bindings ?? []).filter(b => role === undefined || b.role === role).flatMap(b => b.members);
  };
  const app = `serviceAccount:${SA("fnaf-app")}`;

  const publicMembers = membersOf(PUBLIC_BUCKET);
  check(publicMembers("roles/storage.legacyObjectReader").includes("allUsers"), `${PUBLIC_BUCKET}は、名前を知っていれば誰でも読める(legacyObjectReader)`);
  check(!publicMembers("roles/storage.objectViewer").includes("allUsers"), `${PUBLIC_BUCKET}の一覧は、誰にも見せない(objectViewerが無い)`);
  check(publicMembers("roles/storage.objectUser").includes(app), `fnaf-appが${PUBLIC_BUCKET}に書ける`);

  const privateMembers = membersOf(PRIVATE_BUCKET);
  check(!privateMembers().some(m => m === "allUsers" || m === "allAuthenticatedUsers"), `${PRIVATE_BUCKET}は公開していない`);
  check(privateMembers("roles/storage.objectUser").includes(app), `fnaf-appが${PRIVATE_BUCKET}に書ける`);
  const desc = JSON.parse(gcloud(`storage buckets describe gs://${PRIVATE_BUCKET} --format=json`));
  check(desc.public_access_prevention === "enforced", `${PRIVATE_BUCKET}は公開を防ぐ設定(enforced)`, desc.public_access_prevention);
};

const checkIngest = async (apiKey) => {
  const base = urlOf("ingest");
  console.log(`\n== ingest ${base}`);
  const health = await call(base, "GET", "/health");
  check(health.status === 200, "GET /health が200", health.status);

  // 投稿画面と管理画面向けのルート(app)は、ingestに載っていてはいけない
  for (const [method, path] of [["GET", "/pr-assets/mine"], ["POST", "/pr-assets"], ["POST", "/pr-assets/x/withdraw"]]) {
    const res = await call(base, method, path);
    check(res.status === 404, `${method} ${path} が404(appのルートが無い)`, res.status);
  }
  // 内部用のルート(worker)も、公開するingestに載っていてはいけない
  for (const path of ["/aggregate", "/pubsub/scan-events", "/internal/batch/calc-max-device"]) {
    const res = await call(base, "POST", path);
    check(res.status === 404, `POST ${path} が404(workerのルートが無い)`, res.status);
  }
  const doc = await call(base, "GET", "/doc");
  const paths = Object.keys(doc.json?.paths ?? {});
  check(doc.status === 200 && paths.includes("/receiveSensorData") && !paths.some(p => p.startsWith("/pr-assets")),
    "/docに受信のルートがあり、/pr-assetsが無い", paths.join(", "));

  const noKey = await call(base, "POST", "/receiveSensorData", { body: {} });
  check(noKey.status === 401, "APIキーが無い受信が401", noKey.status);
  const wrongKey = await call(base, "POST", "/receiveSensorData", { headers: { "x-api-key": "wrong-key" }, body: {} });
  check(wrongKey.status === 401, "違うAPIキーの受信が401", wrongKey.status);

  // ここからはFirestoreを読む。500なら、GCLOUD_PROJECT、fnaf-ingestの権限、複合インデックスのどれかを疑い、ingestのログを見る
  const assets = await call(base, "GET", "/signage/assets", { headers: { "x-api-key": apiKey } });
  check(assets.status === 200, "GET /signage/assets が200(APIキーとFirestoreの読み出し)", assets.status);
  // 存在しないlocationで呼ぶ。データが無くても、複合インデックスが無ければ500になる
  const missing = `missing_${Date.now()}`;
  const latest = await call(base, "GET", `/getCongestion?location=${missing}`);
  check(latest.status === 404, "GET /getCongestion が404(クエリと複合インデックス)", latest.status);
  const history = await call(base, "GET", `/getCongestionHistory?location=${missing}`);
  check(history.status === 404, "GET /getCongestionHistory が404(クエリと複合インデックス)", history.status);
};

const checkWorker = async (token) => {
  const base = urlOf("worker");
  console.log(`\n== worker ${base}`);
  // Cloud Runの認証必須なので、トークンが無ければコンテナに届く前に弾かれる
  const anonymous = await call(base, "GET", "/health");
  check(anonymous.status === 401 || anonymous.status === 403, "トークンが無いと401か403", anonymous.status);

  const auth = { Authorization: `Bearer ${token}` };
  const health = await call(base, "GET", "/health", { headers: auth });
  check(health.status === 200, "トークン付きの GET /health が200", health.status);
  for (const [method, path] of [["GET", "/pr-assets/mine"], ["POST", "/receiveSensorData"], ["GET", "/getCongestion"]]) {
    const res = await call(base, method, path, { headers: auth });
    check(res.status === 404, `${method} ${path} が404(appとingestのルートが無い)`, res.status);
  }
};

const checkApp = async (origins) => {
  const base = urlOf("app");
  console.log(`\n== app ${base}`);
  const health = await call(base, "GET", "/health");
  check(health.status === 200, "GET /health が200", health.status);

  // 認証はアプリの中で行う。トークンが無ければ、本文を読む前に401を返す
  for (const [method, path] of [["GET", "/pr-assets/mine"], ["POST", "/pr-assets"], ["POST", "/pr-assets/x/withdraw"]]) {
    const res = await call(base, method, path);
    check(res.status === 401, `トークンが無い ${method} ${path} が401`, res.status);
  }
  for (const [method, path] of [["POST", "/receiveSensorData"], ["GET", "/signage/assets"], ["POST", "/aggregate"], ["POST", "/pubsub/scan-events"]]) {
    const res = await call(base, method, path);
    check(res.status === 404, `${method} ${path} が404(ingestとworkerのルートが無い)`, res.status);
  }
  const doc = await call(base, "GET", "/doc");
  const paths = Object.keys(doc.json?.paths ?? {});
  check(doc.status === 200 && paths.includes("/pr-assets/mine") && paths.every(p => p === "/health" || p.startsWith("/pr-assets")),
    "/docに/pr-assetsと/healthだけがある", paths.join(", "));

  // 許したオリジンにだけ、Access-Control-Allow-Originを返す
  const preflight = (origin) => call(base, "OPTIONS", "/pr-assets/mine", {
    headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
  });
  if (origins.length === 0) {
    check(false, "APP_ALLOWED_ORIGINSにオリジンがある");
  } else {
    const allowed = await preflight(origins[0]);
    check(allowed.headers.get("access-control-allow-origin") === origins[0], `${origins[0]}からのCORSを許す`, allowed.headers.get("access-control-allow-origin") ?? "なし");
  }
  const denied = await preflight("https://example.com");
  check(denied.headers.get("access-control-allow-origin") === null, "ほかのオリジンからのCORSは許さない", denied.headers.get("access-control-allow-origin") ?? "なし");
};

// 受信 → Pub/Sub → worker → pending_scans → Cloud Schedulerの/aggregate → congestion_records → /getCongestion を通しで確かめる
const sendAndWait = async (apiKey) => {
  const base = urlOf("ingest");
  console.log(`\n== 受信から集計まで(location: ${TEST_LOCATION})`);
  const body = {
    sendId: randomUUID(),
    nodeId: TEST_LOCATION,
    location: TEST_LOCATION,
    // ダミーのmac。既定のフィルタ(Appleの本体端末、RSSIが-100以上)を通る値にする
    devices: [{ mac: "02:00:00:00:00:01", rssi: -60, format: "parsed", companyId: "004C", isNearbyInfo: true }],
  };
  const res = await call(base, "POST", "/receiveSensorData", { headers: { "x-api-key": apiKey }, body });
  check(res.status === 200, "テストのデータの受信が200(Pub/Subへのpublishまで)", res.status);
  if (res.status !== 200) return;

  const receivedAt = Date.parse(res.json.received_at);
  const windowStart = new Date(Math.floor(receivedAt / WINDOW_MS) * WINDOW_MS).toISOString();
  console.log(`    受信時刻 ${res.json.received_at}、入る窓 ${windowStart}。集計を待つ(30秒ごとに確かめる)`);

  const deadline = Date.now() + SEND_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 30_000));
    const latest = await call(base, "GET", `/getCongestion?location=${TEST_LOCATION}`);
    if (latest.status === 200 && latest.json.data.windowStart >= windowStart) {
      // フィルタの設定(config/filter_pipeline)を変えていなければ、1台になる
      check(latest.json.data.uniqueDeviceCount === 1, "集計されて/getCongestionに出た。台数が1", JSON.stringify(latest.json.data));
      return;
    }
    if (latest.status !== 200 && latest.status !== 404) {
      check(false, "GET /getCongestion が200か404", latest.status);
      return;
    }
  }
  check(false, `${SEND_WAIT_MS / 60000}分待っても集計されない`,
    "workerのログ、pending_scans、gcloud scheduler jobs describe aggregate の順に見る");
};

const main = async () => {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const withApp = args.includes("--app");
  // gcloudでログインしているアカウントで、APIキーとworkerを呼ぶトークンを取る
  const apiKey = gcloud(`secrets versions access latest --secret=esp32-api-key --project=${PROJECT}`);
  const token = gcloud("auth print-identity-token");

  checkService("ingest", {
    sa: "fnaf-ingest",
    env: {
      SERVICE_ROLE: "ingest",
      GCLOUD_PROJECT: PROJECT,
      SCAN_EVENTS_TOPIC: "scan-events",
      PR_ASSET_BUCKET: PUBLIC_BUCKET,
      MAC_HASH_KEY: "(シークレット)",
      ESP32_API_KEY: "(シークレット)",
    },
    isPublic: true,
  });
  const worker = checkService("worker", { sa: "fnaf-worker", env: { SERVICE_ROLE: "worker", GCLOUD_PROJECT: PROJECT }, isPublic: false });
  check(worker.invokers.includes(`serviceAccount:${SA("fnaf-invoker")}`), "fnaf-invokerがworkerを呼べる(Pub/SubとCloud Scheduler)");

  let origins = [];
  if (withApp) {
    const app = checkService("app", {
      sa: "fnaf-app",
      env: { SERVICE_ROLE: "app", GCLOUD_PROJECT: PROJECT, PR_ASSET_BUCKET: PUBLIC_BUCKET, PR_ASSET_PRIVATE_BUCKET: PRIVATE_BUCKET },
      isPublic: true,
    });
    for (const name of ["AUTH0_DOMAIN", "AUTH0_AUDIENCE", "APP_ALLOWED_ORIGINS"]) {
      check(Boolean(app.env[name]), `環境変数${name}がある`, app.env[name] ?? "未設定");
    }
    origins = (app.env.APP_ALLOWED_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(origin => origin !== "");
    checkBuckets();
  }

  await checkIngest(apiKey);
  await checkWorker(token);
  if (withApp) await checkApp(origins);
  if (send) await sendAndWait(apiKey);

  console.log(failures === 0 ? "\nすべてOK" : `\nNGが${failures}件`);
  if (send) {
    console.log(`BigQueryに入ったかは、次で確かめる(受信から数秒で入る):
  bq --project_id=${PROJECT} query --use_legacy_sql=false "SELECT receivedAt, sendId, ARRAY_LENGTH(devices) AS devices FROM fnaf_analytics.scan_events WHERE receivedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR) AND nodeId = '${TEST_LOCATION}'"`);
  }
  process.exitCode = failures === 0 ? 0 : 1;
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
