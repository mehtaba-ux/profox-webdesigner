import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, ChevronRight, CircleAlert, Clock3, Loader2, ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationCenterFilter, NotificationCenterItem, notificationCenterService } from '../../../lib/notificationCenterService';

const FILTERS: Array<{ key: NotificationCenterFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'action', label: 'Action Required' },
  { key: 'approvals', label: 'Approvals / Reviews' },
  { key: 'updates', label: 'Updates' },
  { key: 'warnings', label: 'Warnings' }
];

function relativeTime(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function NotificationIcon({ item }: { item: NotificationCenterItem }) {
  if (item.priority === 'Critical') return <CircleAlert className="h-4 w-4 text-red-600" />;
  if (item.category === 'Warning') return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  if (item.category === 'Approval / Review') return <ShieldCheck className="h-4 w-4 text-[#000080]" />;
  if (item.category === 'Reminder' || item.category === 'Action Required') return <Clock3 className="h-4 w-4 text-amber-600" />;
  return <Bell className="h-4 w-4 text-slate-500" />;
}

export default function NotificationCenterDrawer({ open, onClose, onUnreadChange }: { open: boolean; onClose: () => void; onUnreadChange?: (count: number) => void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<NotificationCenterFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationCenterItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const load = async (offset = 0, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const page = await notificationCenterService.get({ limit: 30, offset, filter, unreadOnly });
      setItems(current => append ? [...current, ...page.items] : page.items);
      setUnreadCount(page.unreadCount);
      setHasMore(page.hasMore);
      onUnreadChange?.(page.unreadCount);
    } catch (err: any) {
      setError(err?.message || 'Notifications could not be loaded.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (open) void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, unreadOnly]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const visibleUnread = useMemo(() => items.filter(item => !item.readAt).length, [items]);

  const markRead = async (id: string) => {
    const target = items.find(item => item.id === id);
    if (!target || target.readAt) return;
    try {
      await notificationCenterService.markRead(id);
      const now = new Date().toISOString();
      setItems(current => unreadOnly ? current.filter(item => item.id !== id) : current.map(item => item.id === id ? { ...item, readAt: now } : item));
      const next = Math.max(0, unreadCount - 1);
      setUnreadCount(next);
      onUnreadChange?.(next);
    } catch (err: any) { setError(err?.message || 'Notification could not be marked read.'); }
  };

  const markAll = async () => {
    try {
      await notificationCenterService.markAllRead();
      setUnreadCount(0);
      onUnreadChange?.(0);
      if (unreadOnly) setItems([]); else setItems(current => current.map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    } catch (err: any) { setError(err?.message || 'Notifications could not be marked read.'); }
  };

  const openNotification = async (item: NotificationCenterItem) => {
    if (!item.readAt) await markRead(item.id);
    if (item.actionUrl) {
      onClose();
      navigate(item.actionUrl);
    }
  };

  if (!open) return null;

  return <div className="fixed inset-0 z-[110]">
    <button type="button" className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" onClick={onClose} aria-label="Close notifications" />
    <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-200 bg-[#f7f9fc] shadow-2xl sm:max-w-[430px]" role="dialog" aria-modal="true" aria-label="Notifications">
      <header className="border-b border-slate-200 bg-white px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><h2 className="text-lg font-black text-slate-900">Notifications</h2>{unreadCount > 0 && <span className="rounded-full bg-[#000080] px-2 py-0.5 text-[10px] font-black text-white">{unreadCount > 99 ? '99+' : unreadCount} unread</span>}</div><p className="mt-1 text-[11px] text-slate-500">Important work, approvals and updates routed to you.</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} className="rounded border-slate-300" />Unread only</label>
          <button type="button" disabled={unreadCount === 0} onClick={() => void markAll()} className="inline-flex items-center gap-1.5 text-[11px] font-black text-[#000080] disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />Mark all as read</button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(tab => <button key={tab.key} type="button" onClick={() => setFilter(tab.key)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[10px] font-extrabold ${filter === tab.key ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{tab.label}</button>)}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
        {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div> : items.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><CheckCheck className="h-7 w-7 text-emerald-600" /><div className="mt-3 text-sm font-black">You're all caught up.</div><p className="mt-1 max-w-[260px] text-xs leading-5 text-slate-500">{unreadOnly ? 'There are no unread notifications in this view.' : 'No notifications match this filter.'}</p></div> : <div className="space-y-2.5">
          {items.map(item => <article key={item.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${item.readAt ? 'border-slate-200' : 'border-blue-200 ring-1 ring-blue-50'}`}>
            <div className="flex gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.category === 'Approval / Review' ? 'bg-blue-50' : item.priority === 'Critical' ? 'bg-red-50' : 'bg-slate-50'}`}><NotificationIcon item={item} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 text-xs font-black leading-5 text-slate-900">{item.title}</h3>{!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#FF0E0E]" />}</div>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.message}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-slate-400"><span>{item.module}</span><span>•</span><span>{item.category}</span><span>•</span><span>{relativeTime(item.createdAt)}</span>{item.priority !== 'Normal' && <><span>•</span><span className={item.priority === 'Critical' ? 'text-red-600' : 'text-amber-600'}>{item.priority}</span></>}</div>
                <div className="mt-3 flex items-center gap-2">
                  {item.actionUrl && <button type="button" onClick={() => void openNotification(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#000080] px-3 py-1.5 text-[10px] font-extrabold text-white">{item.category === 'Approval / Review' ? 'Review' : 'Open'}<ChevronRight className="h-3 w-3" /></button>}
                  {!item.readAt && <button type="button" onClick={() => void markRead(item.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-extrabold text-slate-600">Mark Read</button>}
                </div>
              </div>
            </div>
          </article>)}
          {hasMore && <button type="button" disabled={loadingMore} onClick={() => void load(items.length, true)} className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 disabled:opacity-50">{loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}</button>}
        </div>}
      </div>
      <footer className="border-t border-slate-200 bg-white px-5 py-3 text-[10px] text-slate-400">Opening this drawer never deletes notification history. {visibleUnread > 0 ? `${visibleUnread} unread shown.` : ''}</footer>
    </aside>
  </div>;
}
