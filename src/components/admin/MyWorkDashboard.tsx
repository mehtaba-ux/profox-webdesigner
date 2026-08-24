import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, CheckCircle2, ChevronRight, Clock, Eye, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { projectService } from '../../lib/projectService';
import { useAuth } from '../../lib/AuthContext';
import { TaskPriority, TaskStatus, TASK_STATUSES } from '../../types';
import ContentDeliveryTaskWorkspace from './ContentDeliveryTaskWorkspace';
import ContentDeliveryManagement from './ContentDeliveryManagement';
import ProductivityPlaybookChecklist from './ProductivityPlaybookChecklist';
import DesignDeliveryTaskWorkspace from './DesignDeliveryTaskWorkspace';
import DesignReviewQueue from './DesignReviewQueue';
import DesignHandoffPanel from './DesignHandoffPanel';
import DevelopmentDeliveryTaskWorkspace from './DevelopmentDeliveryTaskWorkspace';
import DevelopmentReviewQueue from './DevelopmentReviewQueue';
import DevelopmentHandoverManagerQueue from './DevelopmentHandoverManagerQueue';

type WorkFilter = 'All' | 'Overdue' | 'Due Today' | 'Upcoming' | 'In Progress' | 'Waiting for Review' | 'Changes Required';
type FounderPreviewRole = 'content_writer' | 'uiux_designer' | 'developer';

const taskDueDate = (task: any) => task?.due_date || task?.dueDate || '';
const CONTENT_REVIEW_ROLES = new Set(['admin', 'project_manager', 'editor', 'qa', 'site_manager']);
const DESIGN_REVIEW_ROLES = new Set(['admin', 'project_manager', 'site_manager', 'uiux_designer', 'qa']);
const DESIGN_HANDOFF_ROLES = new Set(['developer', 'web_developer', 'developer_designer', 'qa']);
const DEVELOPMENT_ROLES = new Set(['developer', 'web_developer', 'developer_designer']);
const DEVELOPMENT_MANAGER_ROLES = new Set(['admin', 'project_manager', 'site_manager']);
const FOUNDER_PREVIEW_ROLES = new Set<FounderPreviewRole>(['content_writer', 'uiux_designer', 'developer']);

const workflowKey = (task: any) => String(task?.workflow_key || task?.workflowKey || '').toLowerCase();
const departmentKey = (task: any) => String(task?.department || '').toLowerCase();
const isContentTask = (task: any) => workflowKey(task).startsWith('content_') || departmentKey(task).includes('content');
const isUiuxTask = (task: any) => workflowKey(task) === 'uiux_design' || departmentKey(task).includes('ui/ux') || departmentKey(task).includes('design');
const isDevelopmentTask = (task: any) => workflowKey(task).startsWith('development_') || departmentKey(task).includes('development');
const projectIdForTask = (task: any) => task?.project_id || task?.projectId || task?.project?.id || null;

function filterPreviewTasks(tasks: any[], previewRole: FounderPreviewRole | null) {
  const openTasks = tasks.filter(task => task.status !== 'Done');
  if (previewRole === 'content_writer') return openTasks.filter(isContentTask);
  if (previewRole === 'uiux_designer') return openTasks.filter(isUiuxTask);
  if (previewRole === 'developer') return openTasks.filter(isDevelopmentTask);
  return openTasks;
}

export default function MyWorkDashboard() {
  const { user, role, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedPreviewRole = searchParams.get('previewRole') as FounderPreviewRole | null;
  const previewRole = isAdmin && requestedPreviewRole && FOUNDER_PREVIEW_ROLES.has(requestedPreviewRole)
    ? requestedPreviewRole
    : null;
  const isFounderPreview = Boolean(previewRole);
  const effectiveRole = previewRole || role;

  const isContentWriter = effectiveRole === 'content_writer';
  const isUiuxDesigner = effectiveRole === 'uiux_designer';
  const isDeveloper = DEVELOPMENT_ROLES.has(String(effectiveRole || ''));
  const canManageContent = CONTENT_REVIEW_ROLES.has(String(effectiveRole || ''));
  const canReviewDesign = DESIGN_REVIEW_ROLES.has(String(effectiveRole || ''));
  const canUseDesignHandoff = DESIGN_HANDOFF_ROLES.has(String(effectiveRole || ''));
  const isManagerHandoverReviewer = DEVELOPMENT_MANAGER_ROLES.has(String(effectiveRole || ''));

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<WorkFilter>('All');
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [taskNotes, setTaskNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);
    if (isFounderPreview) {
      const { data } = await projectService.getAllTasks();
      setTasks(filterPreviewTasks(data || [], previewRole));
    } else {
      const { data } = await projectService.getMyTasks(user.id);
      setTasks(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) void fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isFounderPreview, previewRole]);

  const updateStatus = async (taskId: string, status: TaskStatus) => {
    if (isFounderPreview) return;
    const target = tasks.find(task => task.id === taskId) || selectedTask;
    if (isContentWriter || (target && (isUiuxTask(target) || isDevelopmentTask(target)))) return;
    const { data, error } = await projectService.updateTask(taskId, {
      status,
      completedAt: status === 'Done' ? new Date().toISOString() : null
    });
    if (!error) {
      setTasks(current => current.map(task => task.id === taskId ? { ...task, ...data } : task));
      setSelectedTask((current: any) => current?.id === taskId ? { ...current, ...data } : current);
    }
  };

  const saveNotes = async () => {
    if (isFounderPreview || !selectedTask || isContentWriter || isUiuxTask(selectedTask) || isDevelopmentTask(selectedTask)) return;
    setSaving(true);
    const { data, error } = await projectService.updateTask(selectedTask.id, { notes: taskNotes });
    if (!error) {
      setTasks(current => current.map(task => task.id === selectedTask.id ? { ...task, notes: taskNotes } : task));
      setSelectedTask((current: any) => ({ ...current, ...data, notes: taskNotes }));
    }
    setSaving(false);
  };

  const openTask = (task: any) => {
    setSelectedTask(task);
    setTaskNotes(task.notes || '');
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const priorityClass = (priority: TaskPriority) => ({
    Low: 'text-slate-500 bg-slate-50 border-slate-200',
    Normal: 'text-blue-600 bg-blue-50 border-blue-200',
    High: 'text-amber-600 bg-amber-50 border-amber-200',
    Urgent: 'text-red-600 bg-red-50 border-red-200'
  }[priority] || 'text-slate-500 bg-slate-50 border-slate-200');
  const statusClass = (status: TaskStatus) => ({
    'To Do': 'bg-slate-100 text-slate-700 border-slate-200',
    'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
    Review: 'bg-[#000080]/10 text-[#000080] border-[#000080]/20',
    'Changes Required': 'bg-amber-50 text-amber-700 border-amber-200',
    Done: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }[status] || 'bg-slate-100 text-slate-700 border-slate-200');

  const filtered = useMemo(() => tasks.filter(task => {
    const project = task.project || {};
    const haystack = `${task.title || ''} ${project.projectName || project.project_name || ''} ${project.projectNumber || project.project_number || ''} ${project.client?.companyName || project.client?.company_name || ''} ${project.packageSnapshot || project.package_snapshot || ''}`.toLowerCase();
    if (!haystack.includes(searchTerm.toLowerCase())) return false;
    const due = taskDueDate(task)?.split('T')[0] || '';
    if (activeFilter === 'Overdue') return Boolean(due && due < today && task.status !== 'Done');
    if (activeFilter === 'Due Today') return due === today && task.status !== 'Done';
    if (activeFilter === 'Upcoming') return Boolean(due && due > today && task.status !== 'Done');
    if (activeFilter === 'In Progress') return task.status === 'In Progress';
    if (activeFilter === 'Waiting for Review') return task.status === 'Review';
    if (activeFilter === 'Changes Required') return task.status === 'Changes Required';
    return true;
  }), [tasks, searchTerm, activeFilter, today]);

  const stats = useMemo(() => ({
    open: tasks.length,
    today: tasks.filter(task => taskDueDate(task)?.split('T')[0] === today).length,
    overdue: tasks.filter(task => taskDueDate(task)?.split('T')[0] < today).length,
    review: tasks.filter(task => task.status === 'Review').length,
    changes: tasks.filter(task => task.status === 'Changes Required').length
  }), [tasks, today]);

  const focusTask = useMemo(() => {
    const priority: Record<string, number> = { Urgent: 40, High: 25, Normal: 10, Low: 0 };
    return [...tasks].filter(task => task.status !== 'Done').sort((a, b) => {
      const dueA = taskDueDate(a)?.split('T')[0] || '9999-12-31';
      const dueB = taskDueDate(b)?.split('T')[0] || '9999-12-31';
      const score = (task: any, due: string) =>
        (due < today ? 100 : due === today ? 70 : 0) +
        (task.status === 'Changes Required' ? 60 : task.status === 'In Progress' ? 30 : task.status === 'Review' ? -10 : 0) +
        (priority[task.priority] || 0);
      return score(b, dueB) - score(a, dueA) || dueA.localeCompare(dueB);
    })[0] || null;
  }, [tasks, today]);

  useEffect(() => {
    if ((!isUiuxDesigner && !isDeveloper) || !tasks.length) return;
    const focusId = new URLSearchParams(window.location.search).get('focusTask');
    if (!focusId) return;
    const task = tasks.find(item => item.id === focusId && (isUiuxDesigner ? isUiuxTask(item) : isDevelopmentTask(item)));
    if (task) openTask(task);
  }, [isUiuxDesigner, isDeveloper, tasks]);

  const title = isContentWriter
    ? 'Content Delivery'
    : isUiuxDesigner
      ? 'My Work · Design Delivery'
      : isDeveloper
        ? 'My Work · Development Delivery'
        : 'My Work';
  const description = isContentWriter
    ? 'Open the highest-priority assignment, follow the guided SOP, and let the system handle the process around you.'
    : isUiuxDesigner
      ? 'Work from the canonical UI/UX task. Approved Content, structured evidence, review gates and developer handoff stay connected in PF-SOP-08.'
      : isDeveloper
        ? 'Build from the approved UI/UX handoff through PF-SOP-09 engineering evidence, independent review, QA, release readiness and controlled handover.'
        : canManageContent
          ? 'Manage assigned work and keep delivery quality, reviews and bottlenecks visible in one place.'
          : 'Manage assigned tasks, work notes and review handoffs.';
  const previewLabel = previewRole === 'content_writer'
    ? 'Content Writer'
    : previewRole === 'uiux_designer'
      ? 'UI/UX Designer'
      : 'Developer';

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {isContentWriter && <span className="rounded-full bg-[#000080]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">PF-SOP-07</span>}
            {isUiuxDesigner && <span className="rounded-full bg-[#000080]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">PF-SOP-08</span>}
            {isDeveloper && <span className="rounded-full bg-[#000080]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">PF-SOP-09</span>}
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
        </div>
        {isContentWriter && !isFounderPreview && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
            <ShieldCheck className="h-4 w-4" /> Simple workflow · protected quality
          </div>
        )}
      </header>

      {isFounderPreview && (
        <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />
            <div>
              <div className="text-xs font-black">Founder preview · {previewLabel} dashboard</div>
              <p className="mt-0.5 text-[11px] leading-5 text-blue-800">
                Read-only department view using the real dashboard. It combines active {previewLabel.toLowerCase()} tasks; individual staff still see only their own assigned work.
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#000080]">No worker actions</span>
        </div>
      )}

      {!isFounderPreview && !isContentWriter && canManageContent && <ContentDeliveryManagement />}
      {!isFounderPreview && canReviewDesign && <DesignReviewQueue onChanged={fetchTasks} />}
      {!isFounderPreview && <DevelopmentReviewQueue onChanged={fetchTasks} />}
      {!isFounderPreview && <DevelopmentHandoverManagerQueue enabled={isManagerHandoverReviewer} onChanged={fetchTasks} />}

      {isContentWriter && focusTask && (
        <section className="rounded-[28px] bg-gradient-to-br from-[#000080] to-[#00005c] p-5 text-white shadow-xl shadow-blue-950/10 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200"><Sparkles className="h-3.5 w-3.5" /> Focus now</div>
              <h2 className="mt-2 text-xl font-black">{focusTask.title}</h2>
              <p className="mt-1 text-sm text-blue-100">{focusTask.project?.client?.company_name || focusTask.project?.client?.companyName || 'Client'} · {focusTask.project?.project_name || focusTask.project?.projectName || 'Project'}</p>
            </div>
            <button type="button" onClick={() => openTask(focusTask)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-black text-[#000080]">
              {isFounderPreview ? 'View Task' : 'Open Content Workspace'} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {isUiuxDesigner && focusTask && (
        <section className="rounded-[28px] border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Focus now · PF-SOP-08</div>
              <h2 className="mt-1 text-base font-black text-slate-900">{focusTask.title}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{focusTask.project?.project_number || focusTask.project?.projectNumber || 'Project'} · {focusTask.status}</p>
            </div>
            <button type="button" onClick={() => openTask(focusTask)} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">
              {isFounderPreview ? 'View Task' : 'Open Design Workspace'} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {isDeveloper && focusTask && (
        <section className="rounded-[28px] border border-cyan-200 bg-gradient-to-r from-cyan-50 to-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Focus now · PF-SOP-09</div>
              <h2 className="mt-1 text-base font-black text-slate-900">{focusTask.title}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{focusTask.project?.project_number || focusTask.project?.projectNumber || 'Project'} · {focusTask.project?.project_name || focusTask.project?.projectName || ''} · {focusTask.status}</p>
            </div>
            <button type="button" onClick={() => openTask(focusTask)} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">
              {isFounderPreview ? 'View Task' : 'Open Development Workspace'} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Open', stats.open, 'text-slate-900'],
          ['Due Today', stats.today, 'text-[#000080]'],
          ['Overdue', stats.overdue, 'text-red-600'],
          ['In Review', stats.review, 'text-violet-700'],
          ['Changes', stats.changes, 'text-amber-700']
        ].map(([label, value, cls]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
            <div className={`mt-1 text-xl font-black ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-3xl gap-1 overflow-x-auto pb-1">
          {(['All', 'Overdue', 'Due Today', 'Upcoming', 'In Progress', 'Waiting for Review', 'Changes Required'] as WorkFilter[]).map(filter => (
            <button key={filter} type="button" onClick={() => setActiveFilter(filter)} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold ${activeFilter === filter ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{filter}</button>
          ))}
        </div>
        <div className="relative min-w-[260px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search client, project, package or task..." className="w-full rounded-2xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#000080]/10" />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#000080] border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[32px] border border-dashed border-slate-300 bg-white py-16 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 text-lg font-bold">All caught up</h3></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => {
            const project = task.project || {};
            const due = taskDueDate(task);
            const overdue = due && due.split('T')[0] < today;
            const designTask = isUiuxTask(task);
            const developmentTask = isDevelopmentTask(task);
            return (
              <div key={task.id} onClick={() => openTask(task)} className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:shadow-lg lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className={`shrink-0 rounded-xl p-2 ${overdue ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-[#000080]'}`}><Briefcase className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold">{task.title}</h4>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusClass(task.status)}`}>{task.status}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${priorityClass(task.priority)}`}>{task.priority}</span>
                      {isUiuxDesigner && designTask && <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">Canonical content handoff</span>}
                      {isDeveloper && developmentTask && <span className="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[9px] font-black text-cyan-700">Approved design handoff</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                      <span className="font-bold text-[#000080]">{project.projectNumber || project.project_number}: {project.projectName || project.project_name}</span>
                      <span>Client: {project.client?.companyName || project.client?.company_name || 'Client'}</span>
                      {isContentWriter && <span>Package: {project.package_snapshot || project.packageSnapshot || 'Project package'}</span>}
                      <span className={overdue ? 'font-bold text-red-600' : ''}>Due: {due ? format(new Date(due), 'MMM d, yyyy') : 'No due date'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={event => event.stopPropagation()}>
                  {isFounderPreview ? (
                    <button onClick={() => openTask(task)} className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700">View Task</button>
                  ) : isContentWriter ? (
                    <button onClick={() => openTask(task)} className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-[#000080]">Open Workspace</button>
                  ) : isUiuxDesigner && designTask ? (
                    <button onClick={() => openTask(task)} className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-[#000080]">Open Design Workspace</button>
                  ) : isDeveloper && developmentTask ? (
                    <button onClick={() => openTask(task)} className="rounded-xl bg-cyan-50 px-3 py-2 text-[11px] font-bold text-[#000080]">Open Development Workspace</button>
                  ) : task.status !== 'Review' ? (
                    <button onClick={() => void updateStatus(task.id, 'Review')} className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-[#000080]">Ready for Review</button>
                  ) : null}
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedTask && isFounderPreview ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm sm:p-5">
          <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
            <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusClass(selectedTask.status)}`}>{selectedTask.status}</span>
                  <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#000080]">Read only</span>
                </div>
                <h3 className="mt-2 text-lg font-black">{selectedTask.title}</h3>
                <p className="text-xs text-slate-500">{selectedTask.project?.project_number || selectedTask.project?.projectNumber}: {selectedTask.project?.project_name || selectedTask.project?.projectName}</p>
              </div>
              <button onClick={() => setSelectedTask(null)} className="p-1 text-slate-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Department</div><div className="mt-1 text-xs font-bold text-slate-800">{selectedTask.department || 'Not set'}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Priority</div><div className="mt-1 text-xs font-bold text-slate-800">{selectedTask.priority}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Due</div><div className="mt-1 text-xs font-bold text-slate-800">{taskDueDate(selectedTask) ? format(new Date(taskDueDate(selectedTask)), 'MMM d, yyyy') : 'No due date'}</div></div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Instructions</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5">{selectedTask.description || 'No specific description provided.'}</div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Current work notes</label>
                <div className="min-h-24 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">{selectedTask.notes || 'No work notes yet.'}</div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] font-semibold text-blue-900"><Eye className="h-4 w-4" /> Founder preview never runs specialist workflow actions or writes task changes.</div>
            </div>
          </div>
        </div>
      ) : selectedTask && isDevelopmentTask(selectedTask) && isDeveloper ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm sm:p-5"><div className="w-full max-w-6xl"><DevelopmentDeliveryTaskWorkspace taskId={selectedTask.id} onClose={() => setSelectedTask(null)} onChanged={fetchTasks} /></div></div>
      ) : selectedTask && isUiuxTask(selectedTask) && isUiuxDesigner ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm sm:p-5"><div className="w-full max-w-6xl"><DesignDeliveryTaskWorkspace taskId={selectedTask.id} onClose={() => setSelectedTask(null)} onChanged={fetchTasks} /></div></div>
      ) : selectedTask ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm sm:p-5">
          <div className={`max-h-[94vh] w-full overflow-y-auto rounded-[30px] bg-slate-50 shadow-2xl ${isContentWriter ? 'max-w-6xl' : 'max-w-xl'}`}>
            <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
              <div>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusClass(selectedTask.status)}`}>{selectedTask.status}</span>
                <h3 className="mt-2 text-lg font-black">{selectedTask.title}</h3>
                <p className="text-xs text-slate-500">{selectedTask.project?.project_number || selectedTask.project?.projectNumber}: {selectedTask.project?.project_name || selectedTask.project?.projectName}</p>
              </div>
              <button onClick={() => setSelectedTask(null)} className="p-1 text-slate-400"><X className="h-5 w-5" /></button>
            </div>
            {isContentWriter ? (
              <div className="space-y-5 p-4 sm:p-6"><ContentDeliveryTaskWorkspace taskId={selectedTask.id} onTaskChanged={() => void fetchTasks()} /><ProductivityPlaybookChecklist entityType="project_task" entityId={selectedTask.id} /></div>
            ) : (
              <div className="space-y-5 p-6">
                {canUseDesignHandoff && projectIdForTask(selectedTask) && <DesignHandoffPanel projectId={projectIdForTask(selectedTask)!} />}
                <div><label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Instructions</label><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5">{selectedTask.description || 'No specific description provided.'}</div></div>
                <div className="grid grid-cols-2 gap-3"><select value={selectedTask.status} onChange={event => void updateStatus(selectedTask.id, event.target.value as TaskStatus)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold">{TASK_STATUSES.map(status => <option key={status}>{status}</option>)}</select><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold">{selectedTask.priority}</div></div>
                <textarea rows={5} value={taskNotes} onChange={event => setTaskNotes(event.target.value)} placeholder="Work notes and progress updates..." className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none" />
                <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] text-slate-400"><Clock className="h-3.5 w-3.5" /> Saved to canonical project task</div><button onClick={() => void saveNotes()} disabled={saving} className="rounded-xl bg-[#000080] px-5 py-2 text-xs font-bold text-white">{saving ? 'Saving...' : 'Save Notes'}</button></div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
