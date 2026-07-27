# Fun Now and Future - Backend

キャンパス内の混雑度リアルタイム可視化システム「Fun Now and Future」のバックエンド API（Firebase Cloud Functions v2）です。
ESP32 から送信される BLE 端末検知データを処理し、Firestore への保存およびサイネージ・アプリ向けの混雑度データ提供を行います。

---

## 🛠 技術構成

* **Runtime**: Node.js / TypeScript
* **Framework**: Firebase Cloud Functions (v2)
* **Database**: Firebase Firestore
* **Validation**: Zod
* **Testing**: Jest / node-mocks-http

---

## 🚀 主な機能・エンドポイント

**Base URL**: 'まだデプロイしてない'

### 1. `POST /receiveSensorData`
ESP32（センサー端末）から BLE デバイス数データを受信し、Firestore に保存します。
* **認証**: ヘッダー `x-api-key: <API_KEY>`
* **リクエストボディ**:
'''json
{
	"sensor_id"
	"location"
	"ble_device_count"
} 

### 2. `GET /getCongestion`
指定したロケーションの**最新の混雑度データ**を取得します。
* **クエリパラメータ**: `location` (必須)
* **自動計算**: 人数に応じた混雑度レベル（`low` / `medium` / `high`）とラベル（`空いている` / `やや混雑` / `混雑`）を付与して返却。

### 3. `GET /getCongestionHistory`
指定したロケーションの**混雑度の履歴データ**を取得します。
* **クエリパラメータ**: `location` (必須), `limit` (任意 / デフォルト10件, 最大50件)

---

## 🧪 ローカル開発・テスト手順

### 1. 依存パッケージのインストール
```bash
npm install
```

### 2. 単体テストの実行
Firestore エミュレータ環境で Jest によるテストを実行します。
```bash
npm test
```

### 3. ローカルエミュレータの起動
```bash
npm run serve
```

##