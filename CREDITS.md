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
