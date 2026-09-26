import {
  CalendarDays,
  Compass,
  Crown,
  Gift,
  Home,
  MessagesSquare,
  PenLine,
  Swords,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { NavIcon } from '@apteez/config';

/** Single mapping from shared nav keys to Lucide icons. */
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: Home,
  swords: Swords,
  trophy: Trophy,
  compass: Compass,
  crown: Crown,
  messages: MessagesSquare,
  calendar: CalendarDays,
  target: Target,
  pen: PenLine,
  gift: Gift,
};
