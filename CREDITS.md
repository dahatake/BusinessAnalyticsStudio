# 3D アセットの権利（CREDITS）

このアプリの 3D 表示（FR-068）は、外部から取得したモデルを使いません。
3D のモデルの読み込み先はローカルのファイルだけで、権利が不明なモデルは同梱しません。

同梱する glTF／3D アセットは、次の表に、権利の種別（許諾済み・自作・手続き生成）付きで載せます。
glTF のファイル（`.gltf`／`.glb`）を足すときは、同じ変更でこの表に行を足してください（`tests/unit/assets-rights.test.ts` が検査します）。

| アセット | 場所 | 権利の種別 | 備考 |
|---|---|---|---|
| ヒーローのデジタルツイン（業種プリセット 5 種） | `src/three/presets.ts` の `heroObjects` | 手続き生成 | 箱・円柱・球・円錐の組合せ |
| 3D KPI タワー | `src/three/presets.ts` の `kpiTowerObjects` | 手続き生成 | 箱 |
| データフローの粒子 | `src/three/presets.ts` の `particlePosition` | 手続き生成 | 点群 |
| AsIs → ToBe のモーフィング | `src/three/presets.ts` の `morphLayouts` | 手続き生成 | 箱の補間 |
| パックのエンティティのデジタルツイン（部品・拠点・担当） | `src/three/entityLayout.ts`、`src/three/twinGeometry.ts` | 手続き生成 | 箱・円柱・球・カプセル（階層から配置を計算） |
| 地球儀・3D マップ・流れの弧と粒子 | `src/map/geo.ts`、`src/map/MapScene.tsx` | 手続き生成 | 球・平面・緯線経線・管・点群（外部の地図画像は使わない） |
| ホログラム・グリッド | `src/three/Cinematic.tsx` | 手続き生成 | 半透明の面と輪郭線、床の格子 |
| HDRI（環境光） | `src/three/Cinematic.tsx`（three の `RoomEnvironment`） | 手続き生成 | three.js 同梱のスタジオ調の部屋を、その場で環境マップにする（MIT。外部の画像は取得しない） |

## 音源の権利（FR-073、NFR-LEGAL-001）

BGM と効果音は、外部から音源を取得せず、すべて Web Audio API（オシレーター）でその場で生成します（音声ファイルは同梱しません）。
顧客が assets/audio/ に音源を置いた場合は、その顧客の責任で権利を確認し、この表に行を足してください。

| 音源 | 場所 | 権利の種別 | 備考 |
|---|---|---|---|
| BGM（静かなアンビエント・先進的なエレクトロニック・温かなアコースティックの 3 曲調。シーンごとに調が変わる） | `src/audio/model.ts` の `bgmBeatNotes` | 手続き生成 | サイン波・三角波・矩形波の合成。乱数ではなくシーン名のハッシュで決まる |
| 効果音（ミュート解除・選択・議題の移動・確認） | `src/audio/model.ts` の `seTones` | 手続き生成 | 短い正弦波・三角波の音の並び |

## ロゴ・フォント・ライブラリの権利（NFR-LEGAL-001）

画像・フォント・音源・3D モデルのファイル（`.svg`／`.png`／`.jpg`／`.ico`／`.woff`／`.woff2`／`.ttf`／`.otf`／`.mp3`／`.wav`／`.ogg`／`.glb`／`.gltf` など）を足すときは、同じ変更でこの節の表に、権利の種別（許諾済み・自作・手続き生成）とライセンスを付けて行を足してください（`tests/unit/credits.test.ts` が検査します）。
他社の商標・ロゴ・実在の人物は、許諾がなければ使いません（NFR-LEGAL-002）。

### ロゴ

| アセット | 場所 | 権利の種別 | ライセンス |
|---|---|---|---|
| お手本パック「ミズホ精機」の架空のロゴ | `examples/mono/assets/brand/logo.svg` | 自作 | 本リポジトリの MIT ライセンス（`LICENSE`）。架空の企業のロゴで、実在の商標ではない |
| お手本パック「コトノハ」の架空のロゴ | `examples/koto/assets/brand/logo.svg` | 自作 | 本リポジトリの MIT ライセンス（`LICENSE`）。架空の企業のロゴで、実在の商標ではない |

### フォント

フォントのファイルは同梱しません。画面は利用者の PC に入っている書体（Segoe UI Variable・Segoe UI・Noto Sans JP・Yu Gothic UI・Meiryo など）を名前で指定するだけで、配布も埋め込みもしません。

### ライブラリ（実行時に同梱するもの）

`package.json` の `dependencies` に挙げたライブラリです。推移的な依存（`node_modules` の本番向けの依存の閉包）は、すべて MIT・Apache-2.0・BSD-3-Clause・ISC・0BSD のいずれかです（`webgl-constants` は package.json にライセンスの欄がなく、同梱の `LICENSE` ファイルが MIT です）。

| ライブラリ | 場所 | 権利の種別 | ライセンス |
|---|---|---|---|
| @fluentui/react-components | `node_modules/@fluentui/react-components` | 許諾済み | MIT |
| @fluentui/react-icons | `node_modules/@fluentui/react-icons` | 許諾済み | MIT |
| @react-three/drei | `node_modules/@react-three/drei` | 許諾済み | MIT |
| @react-three/fiber | `node_modules/@react-three/fiber` | 許諾済み | MIT |
| react | `node_modules/react` | 許諾済み | MIT |
| react-dom | `node_modules/react-dom` | 許諾済み | MIT |
| three | `node_modules/three` | 許諾済み | MIT |
| zod | `node_modules/zod` | 許諾済み | MIT |
| zustand | `node_modules/zustand` | 許諾済み | MIT |
