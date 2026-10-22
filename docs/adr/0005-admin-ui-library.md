# 0005. 管理画面のUIにHeroUI + Tailwind CSSを採用する

- ステータス: 採用
- 決定日: 2026-09-07
- 起票: chirushiyo
- 関連: #14, PR #15

## 背景

管理画面を新しく作る。用途は、センサーの稼働状況の確認と、集計データの参照。運営側が使う内部ツールで、デザインの指定は無い。少人数・短期間で形にする必要がある。

置き場所はリポジトリ直下の`admin/`。

## 決定

HeroUI v3 + Tailwind CSS v4を採用する。

## 理由

「速く作れる」には2種類ある。

- A. 部品がそろっている速さ: DataGridやチャートが既製で、機能の実装が短く済む（MUI、shadcn/uiが得意とする）
- B. 見た目に手をかけずに済む速さ: 置いただけで見られる状態になり、色や余白の調整に時間を取られない（HeroUIが得意とする）

Bを優先した。Aの手間は日数で見積もれるが、Bの手間（なんとなくの安っぽさを直す作業）は終わりが見えず、デザインの指定が無いと特に発散しやすい。少人数で速さを優先するなら、見積もれない方のコストを先に消す。

HeroUIを選んだ点:

- 3候補の中で、既定の見た目の完成度が最も高い
- React Ariaが土台で、フォーカス管理、キーボード操作、ARIA属性を自分で書かずに済む
- 実行時の負担が無い（Tailwind v4 + CSS変数 + CSSアニメーション）
- Tailwindの経験は、他のプロジェクトにも持っていける

## 検討した選択肢

| **選択肢** | **採用しなかった理由** |
|---|---|
| shadcn/ui（次点） | Aでは最適（ブロック、Chart、DataTableのレシピ）。ただ既定の見た目が意図的に抑えたモノクロで、手を入れる前提の出発点。手を入れるなら、避けたかった作業が発生する |
| Mantine | 余白がpropsで段階に制限され、ばらつきが起きにくい。`@mantine/charts`が無料。ただHeroUIほど「置いただけで完成して見える」わけではない |
| MUI | Material Design 2の見た目が古い。M3対応は延期が続き、待つ前提は立てられない。MUI XのDataGridとChartsは無料でAでは最適だが、見た目を変えるとその利点も失う |

## 結果

Aを採用しなかった分のコスト（いずれも日数で見積もれる範囲として受け入れる）:

1. DataGridに当たる部品が無い。TanStack Tableで自前で組む（見積もり4〜5日）
2. チャートは有料版にしか無い。Rechartsを入れ、HeroUIのCSS変数を流し込むラッパーを書く
3. ページ全体のテンプレートは有料版にしか無い。サイドバー、ヘッダー、本文の骨格は自前で組む
4. v3は2026年3月の全面書き直しで、ネットの記事とAIの出力の大半がv2前提。v3のMCPサーバーか`llms.txt`を最初に入れる
5. Tailwindはレイアウトの層で自由に書けてしまい、余白がばらつく。`@theme`で余白を5段階ほどに絞る、`eslint-plugin-tailwindcss`で任意の値を禁止する、`prettier-plugin-tailwindcss`でクラスの順序をそろえる

## 実装

- `d0935c6` Vite、`665db74` Tailwind、`659cf1c` HeroUIの導入、`65c8a34` Tailwindの読み込み（2026-09-07, PR #15）
- 2026-09-23時点: 依存パッケージ（`@heroui/react` 3.2, `tailwindcss` 4.3）は入っている。HeroUIのCSSの読み込み（`@import "@heroui/styles"`）、Viteへの`tailwindcss()`の登録、`@theme`のトークン、ESLintとPrettierのプラグインは未設定で、画面はViteの初期テンプレートのまま
- PR #63（2026-10-08）: `tailwindcss()`の登録と、ESLint、Prettierのプラグインを入れた。HeroUIは、v2の手順（`HeroUIProvider`など）で設定された。前の行に、v3には無い`HeroUIProvider`を未設定として挙げていたため（2026-10-16に直した）
- 2026-10-16: HeroUIをv3の手順に直した。v3で要るのは、CSSの`@import "@heroui/styles"`だけで、Providerは無い
- 結果の5との差分
  - 余白は`@theme`ではなく、ESLintで絞る。HeroUIの部品のCSSは既定の段階（`h-10`、`px-4`など）を使うため、`@theme`で既定の段階を消すと部品が崩れる
  - ESLintのプラグインは、`eslint-plugin-tailwindcss`の代わりに`eslint-plugin-better-tailwindcss`を使う。`eslint-plugin-tailwindcss`は、任意の値は禁止できる（`no-arbitrary-value`）が、Tailwindのクラスを個別に禁止するルールが無く、余白の段階を絞れない。`no-restricted-classes`で、余白（`p`、`m`、`gap`、`space`）を`0`、`1`、`2`、`4`、`6`、`8`（0、4、8、16、24、32px）の段階に限り、任意の値も禁止している

## 一次資料

- issue #14
