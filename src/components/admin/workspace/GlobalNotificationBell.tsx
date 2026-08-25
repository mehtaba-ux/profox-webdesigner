import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { notificationCenterService } from '../../../lib/notificationCenterService';
import NotificationCenterDrawer from './NotificationCenterDrawer';

export default function GlobalNotificationBell({ userId }: { userId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) { setUnread(0); return; }
    try { setUnread(await notificationCenterService.getUnreadCount()); } catch { /* Drawer exposes load errors when opened. */ }
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const timer = window.setInterval(() => void refresh(), 45000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh, userId]);

  return <>
    <button type="button" onClick={() => setOpen(true)} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-white" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}>
      <Bell className="h-[17px] w-[17px]" />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF0E0E] px-1 text-[9px] font-black leading-none text-white ring-2 ring-[#f4f7fb]">{unread > 99 ? '99+' : unread}</span>}
    </button>
    <NotificationCenterDrawer open={open} onClose={() => setOpen(false)} onUnreadChange={setUnread} />
  </>;
}
