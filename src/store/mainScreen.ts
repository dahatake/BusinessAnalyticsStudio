// メイン画面（FR-186）を表示中か。アプリの起動直後は表示中（FR-144 AC-398）。保存しない（再読込のたびにメイン画面から始まる）。
import { create } from 'zustand';
import { enterAnalysisAtBoot, forgetEntered } from './workspaceEntry';

interface MainScreenState {
  shown: boolean;
  /** メイン画面へ戻る（FR-187） */
  show: () => void;
  /** メイン画面から作業先の分析画面へ移る */
  hide: () => void;
}

export const useMainScreen = create<MainScreenState>((set, get) => ({
  // 例外: 別のウィンドウへ移したタスクワークスペース・操作後の再読込は、分析画面から始める（FR-298。store/workspaceEntry.ts）
  shown: !enterAnalysisAtBoot(),
  show: () => { forgetEntered(); set({ shown: true }); },
  hide: () => {
    // メイン画面から分析画面へ移るときは履歴に 1 つ積み、ブラウザーの「戻る」でメイン画面へ戻れるようにする（FR-187 と同じ行き先）
    if (get().shown && typeof window !== 'undefined' && window.history && window.history.state?.eabkAnalysis !== true) {
      window.history.pushState({ ...(window.history.state ?? {}), eabkAnalysis: true }, '');
    }
    set({ shown: false });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e: PopStateEvent) => {
    const analysis = (e.state as { eabkAnalysis?: boolean } | null)?.eabkAnalysis === true;
    const { shown } = useMainScreen.getState();
    if (!analysis && !shown) useMainScreen.setState({ shown: true });
    else if (analysis && shown) useMainScreen.setState({ shown: false });
  });
}
