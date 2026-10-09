顧客パックの置き場所です。ビルド成果物（dist/）には顧客固有のデータを含めません（FR-100）。
実行時は `/data/*.json` を配信する側が、顧客パックの `public/data/` を重ねて返します。
開発中は `npm run dev` が `examples/mono`（`EDB_PACK=koto` で koto）を重ねて返します。
