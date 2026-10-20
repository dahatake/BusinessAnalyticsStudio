// ノードの形（種別を色だけに頼らず区別する。FR-236 AC-549・NFR-A11Y-010）。形の名前 → CSS の clip-path。
export const CLIP: Record<string, string> = {
  circle: 'circle(50%)', square: 'inset(8%)', diamond: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
  hexagon: 'polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)', triangle: 'polygon(50% 0,100% 100%,0 100%)',
  pentagon: 'polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)', octagon: 'polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)',
  stadium: 'inset(20% round 50%)', parallelogram: 'polygon(20% 0,100% 0,80% 100%,0 100%)',
  cross: 'polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)',
  star: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
};
export const clipOf = (shape: string): string => CLIP[shape.replace(/-\d+$/, '')] ?? CLIP.circle!;
