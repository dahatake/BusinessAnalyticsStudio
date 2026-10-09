// アプリで 1 つだけの音声制御（FR-073）。AudioContext は利用者の最初の操作の後にだけ作る（自動再生ポリシー）。
import { AudioController } from './controller';

type AudioContextCtor = typeof AudioContext;

export const audio = new AudioController({
  createContext: () => {
    const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio が使えません');
    return new Ctor();
  },
});
