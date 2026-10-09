import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { restoreInk, startInkAutosave } from './ink/persist';
import { AnimationController } from './motion/AnimationController';
import './motion/motion.css';
import { AppThemeProvider } from './theme/AppThemeProvider';

const root = document.getElementById('root');
if (!root) throw new Error('#root がありません');
const mount = createRoot(root);

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
