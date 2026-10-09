// 表現が成り立たない項目を「表で見る」要求（FR-113）。地図・3D・ガントなどの表現が、
// 「位置情報なし: N 件」などの通知を選ばれたときに、該当の項目の ID を出す。表（`table` コンポーネント）は、これを読んで該当の項目を表示する。
// 保存しない。
import { create } from 'zustand';

export interface FallbackRequest {
  /** 要求した表現の key（`map` など） */
  source: string;
  /** 理由の語（「位置情報なし」など） */
  reason: string;
  /** 該当の項目の ID */
  ids: string[];
}

interface FallbackState {
  request: FallbackRequest | null;
  open: (req: FallbackRequest) => void;
  clear: () => void;
}

export const useFallbackStore = create<FallbackState>((set) => ({
  request: null,
  open: (req) => set({ request: { ...req, ids: [...new Set(req.ids)] } }),
  clear: () => set({ request: null }),
}));
