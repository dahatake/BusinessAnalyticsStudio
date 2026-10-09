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
