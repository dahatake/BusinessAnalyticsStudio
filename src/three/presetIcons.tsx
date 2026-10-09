// 業種プリセットのアイコン（FR-103）。presets.ts の icon キーを Fluent のアイコンに対応付ける。
import {
  BuildingBank24Regular, BuildingFactory24Regular, BuildingGovernment24Regular, Cart24Regular, VehicleTruckProfile24Regular,
} from '@fluentui/react-icons';
import type { IndustryPreset, PresetIconKey } from './presets';

const ICONS: Record<PresetIconKey, typeof BuildingBank24Regular> = {
  bank: BuildingBank24Regular,
  factory: BuildingFactory24Regular,
  cart: Cart24Regular,
  truck: VehicleTruckProfile24Regular,
  government: BuildingGovernment24Regular,
};

export function PresetIcon({ preset }: { preset: IndustryPreset }) {
  const Icon = ICONS[preset.icon];
  return <Icon aria-hidden data-testid={`preset-icon-${preset.id}`} />;
}
