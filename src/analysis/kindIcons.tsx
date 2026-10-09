// ナレッジグラフの節のアイコン（Fluent System Icons）。種別ごとに異なるアイコンで、色だけに頼らず区別する（AC-044）。
import {
  Book24Regular, Box24Regular, Building24Regular, Comment24Regular, DocumentText24Regular, ErrorCircle24Regular, Lightbulb24Regular,
  PuzzlePiece24Regular, Server24Regular, TaskListSquareLtr24Regular, Window24Regular, type FluentIcon,
} from '@fluentui/react-icons';
import type { IconName } from './graphView';

export const KIND_ICON: Record<IconName, FluentIcon> = {
  building: Building24Regular,
  issue: ErrorCircle24Regular,
  lightbulb: Lightbulb24Regular,
  box: Box24Regular,
  puzzle: PuzzlePiece24Regular,
  tasks: TaskListSquareLtr24Regular,
  server: Server24Regular,
  window: Window24Regular,
  book: Book24Regular,
  comment: Comment24Regular,
  document: DocumentText24Regular,
};
