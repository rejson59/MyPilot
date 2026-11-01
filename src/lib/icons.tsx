import {
  Blinds,
  Clapperboard,
  Command,
  DoorOpen,
  Gamepad2,
  Lamp,
  Laptop,
  Monitor,
  Moon,
  PartyPopper,
  Plug,
  Smartphone,
  Snowflake,
  Sparkles,
  Speaker,
  Tablet,
  Tv,
  type LucideIcon,
} from 'lucide-react';
import type { DeviceKind } from '../../shared/types';

export const deviceIcons: Record<DeviceKind, LucideIcon> = {
  light: Lamp,
  led_strip: Sparkles,
  speaker: Speaker,
  tv: Tv,
  ac: Snowflake,
  pc: Monitor,
  laptop: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  plug: Plug,
  blind: Blinds,
};

export const sceneIcons: Record<string, LucideIcon> = {
  command: Command,
  clapperboard: Clapperboard,
  moon: Moon,
  'party-popper': PartyPopper,
  'gamepad-2': Gamepad2,
  'door-open': DoorOpen,
};

export const getDeviceIcon = (kind: DeviceKind): LucideIcon => deviceIcons[kind] ?? Lamp;
export const getSceneIcon = (icon: string): LucideIcon => sceneIcons[icon] ?? Sparkles;
