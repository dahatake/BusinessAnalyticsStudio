import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AnimationController } from './motion/AnimationController';
import './motion/motion.css';
import { AppThemeProvider } from './theme/AppThemeProvider';

const root = document.getElementById('root');
if (!root) throw new Error('#root がありません');
createRoot(root).render(
  <StrictMode>
    <AppThemeProvider>
      <AnimationController />
      <App />
    </AppThemeProvider>
  </StrictMode>,
);
