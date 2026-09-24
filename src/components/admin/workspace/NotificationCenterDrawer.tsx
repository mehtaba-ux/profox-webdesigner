import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] font-sans text-slate-900" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close notifications"
      />

      <aside
        className="absolute inset-y-0 right-0 flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-[#f7f9fc] shadow-2xl sm:inset-y-3 sm:right-3 sm:h-[calc(100dvh-1.5rem)] sm:w-[min(92vw,440px)] sm:rounded-2xl sm:border sm:border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pb-4 sm:pt-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black leading-6 text-slate-900">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-[#000080] px-2 py-0.5 text-[10px] font-black text-white">
                    {unreadCount > 99 ? '99+' : unreadCount} unread
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-[320px] text-[11px] leading-4 text-slate-500">Important work, approvals and updates routed to you.</p>
            </div>
            <button type="button" onClick={onClose} className="-mr-1 shrink-0 rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:mt-4">
            <label className="inline-flex min-h-9 items-center gap-2 text-[11px] font-bold text-slate-600">
              <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Unread only
            </label>
            <button type="button" disabled={unreadCount === 0} onClick={() => void markAll()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] font-black text-[#000080] hover:bg-blue-50 disabled:opacity-40">
              <CheckCheck className="h-3.5 w-3.5" />Mark all as read
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
            {FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`min-h-9 rounded-lg px-3 py-1.5 text-[10px] font-extrabold ${filter === tab.key ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable] sm:p-4">
          {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div>
          ) : items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <CheckCheck className="h-7 w-7 text-emerald-600" />
              <div className="mt-3 text-sm font-black">You're all caught up.</div>
              <p className="mt-1 max-w-[260px] text-xs leading-5 text-slate-500">{unreadOnly ? 'There are no unread notifications in this view.' : 'No notifications match this filter.'}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map(item => (
                <article key={item.id} className={`min-w-0 rounded-2xl border bg-white p-3.5 shadow-sm sm:p-4 ${item.readAt ? 'border-slate-200' : 'border-blue-200 ring-1 ring-blue-50'}`}>
                  <div className="flex min-w-0 gap-3">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.category === 'Approval / Review' ? 'bg-blue-50' : item.priority === 'Critical' ? 'bg-red-50' : 'bg-slate-50'}`}>
                      <NotificationIcon item={item} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-2">
                        <h3 className="min-w-0 flex-1 break-words text-xs font-black leading-5 text-slate-900">{item.title}</h3>
                        {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#FF0E0E]" />}
                      </div>
                      <p className="mt-1 break-words text-[11px] leading-5 text-slate-500">{item.message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                        <span>{item.module}</span><span>•</span><span>{item.category}</span><span>•</span><span>{relativeTime(item.createdAt)}</span>
                        {item.priority !== 'Normal' && <><span>•</span><span className={item.priority === 'Critical' ? 'text-red-600' : 'text-amber-600'}>{item.priority}</span></>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.actionUrl && (
                          <button type="button" onClick={() => void openNotification(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#000080] px-3 py-1.5 text-[10px] font-extrabold text-white hover:bg-[#000066]">
                            {item.category === 'Approval / Review' ? 'Review' : 'Open'}<ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                        {!item.readAt && <button type="button" onClick={() => void markRead(item.id)} className="min-h-9 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-extrabold text-slate-600 hover:bg-slate-50">Mark Read</button>}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {hasMore && (
                <button type="button" disabled={loadingMore} onClick={() => void load(items.length, true)} className="flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-[10px] leading-4 text-slate-400 sm:px-5 sm:py-3">
          <span className="hidden sm:inline">Opening this drawer never deletes notification history. </span>
          {visibleUnread > 0 ? `${visibleUnread} unread shown.` : 'Notification history is preserved.'}
        </footer>
      </aside>
    </div>,
    document.body
  );
}
