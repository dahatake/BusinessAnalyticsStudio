// デジタルツインの形（単位の大きさの共有ジオメトリ）。描画（React Three Fiber）と、可視判定の投影（twinProbe）で同じ形を使う。
// 形は手続きで作り、外部のモデルは取得しない（FR-068）。大きさは mesh の scale（外形の幅）で決める。
import * as THREE from 'three';
import type { TwinShape } from './entityLayout';

const cache = new Map<TwinShape, THREE.BufferGeometry>();

export function twinGeometry(shape: TwinShape): THREE.BufferGeometry {
  let g = cache.get(shape);
  if (!g) {
    switch (shape) {
      case 'cylinder': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 28); break;
      case 'sphere': g = new THREE.SphereGeometry(0.5, 28, 18); break;
      // 幅 1・高さ 2 のカプセル。scale の y に高さ/2 を渡す
      case 'capsule': g = new THREE.CapsuleGeometry(0.5, 1, 6, 20); break;
      default: g = new THREE.BoxGeometry(1, 1, 1);
    }
    cache.set(shape, g);
  }
  return g;
}

/** 外形の幅（x・y・z）から mesh の scale を求める（カプセルだけ、高さの単位が 2 のため y を半分にする） */
export function twinScale(shape: TwinShape, size: readonly [number, number, number]): [number, number, number] {
  return shape === 'capsule' ? [size[0], size[1] / 2, size[2]] : [size[0], size[1], size[2]];
}
