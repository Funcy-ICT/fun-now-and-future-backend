import { Hono } from "hono";
import { z } from "zod";

//管理者画面用
//死活監視, 広報の承認orリジェクト, ディスプレイに現在表示されている情報がわかる情報を返す
//html, css, js, 認証の受け口, 上記のデータを返すapi
//管理者画面のhtml, css, jsはfunctions/public/administrationに置く