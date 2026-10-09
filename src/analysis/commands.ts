// 分析ビュー（FR-039・FR-042）の操作をコマンドパレットに載せる（FR-111）。画面を開いていなくても使える操作だけ。
import { registerCommands, type Command } from '../commands/registry';
import { packKeyOf } from '../discussion/model';
import { usePackStore } from '../store/pack';
import { usePriorityStore } from '../store/priority';
import { useTreeStore } from '../store/tree';

function treeKey(): string | undefined {
  const st = usePackStore.getState().state;
  return st.status === 'ready' ? packKeyOf(st.pack.data.customer.name, st.pack.data.customer.projectName) : undefined;
}

export function analysisCommands(): Command[] {
  return [
    {
      id: 'priority.reset-weights',
      label: '優先順位の重みを AI 提案に戻す',
      keywords: ['優先順位', '重み', 'ウェイト', 'weight', 'reset'],
      run: () => usePriorityStore.getState().reset(),
    },
    {
      id: 'tree.undo',
      label: '議論ツリーの編集を元に戻す',
      keywords: ['議論ツリー', 'ツリー', 'undo'],
      run: () => { const k = treeKey(); if (k) useTreeStore.getState().undo(k); },
    },
    {
      id: 'tree.redo',
      label: '議論ツリーの編集をやり直す',
      keywords: ['議論ツリー', 'ツリー', 'redo'],
      run: () => { const k = treeKey(); if (k) useTreeStore.getState().redo(k); },
    },
    {
      id: 'tree.cancel-generate',
      label: '議論ツリーの生成を取り消す',
      keywords: ['議論ツリー', '生成', '取り消し', 'cancel'],
      run: () => useTreeStore.getState().cancel(),
    },
  ];
}

registerCommands(analysisCommands);
