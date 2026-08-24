import React from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Globe2,
  MessageCircle,
  ReceiptText,
  Settings2,
  UserCog,
  UserPlus,
  UsersRound
} from 'lucide-react';
import { WorkspaceIconName } from '../../../lib/workspaceApps';

const icons: Record<WorkspaceIconName, React.ComponentType<{ className?: string }>> = {
  globe: Globe2,
  users: UsersRound,
  receipt: ReceiptText,
  calendar: CalendarDays,
  building: Building2,
  briefcase: BriefcaseBusiness,
  userPlus: UserPlus,
  book: BookOpen,
  award: Award,
  chart: BarChart3,
  userCog: UserCog,
  message: MessageCircle,
  settings: Settings2
};

export default function WorkspaceAppIcon({ name, className = 'h-7 w-7' }: { name: WorkspaceIconName; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} />;
}
