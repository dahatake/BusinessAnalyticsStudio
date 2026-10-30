import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { restoreInk, startInkAutosave } from './ink/persist';
import { AnimationController } from './motion/AnimationController';
import './motion/motion.css';
import './theme/a11y.css';
import './theme/design.css';
import { installTabsterDummyFix } from './theme/tabsterDummies';
import { AppThemeProvider } from './theme/AppThemeProvider';
import { initProjectPersistence } from './store/persist';
import { bootTaskWorkspaces } from './workspace/taskContext';

const root = document.getElementById('root');
if (!root) throw new Error('#root がありません');
const mount = createRoot(root);
installTabsterDummyFix();
// FR-137 AC-207: 企業・Project・ステッパー・分析を、この端末の localStorage から復元して保存を始める
initProjectPersistence();
// FR-298 AC-809: タスクワークスペースのタスク文脈（絞り込み・選択・配置）を復元して、保存を始める
bootTaskWorkspaces();

// 保存したボード（FR-095・FR-097）を読み込んでから画面を出す。読めなくても、空のボードで始める。
void restoreInk().finally(() => {
  startInkAutosave();
  mount.render(
    <StrictMode>
      <AppThemeProvider>
        <AnimationController />
        <App />
      </AppThemeProvider>
    </StrictMode>,
  );
});
