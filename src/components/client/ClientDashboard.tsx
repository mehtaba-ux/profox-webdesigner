import React, { useState, useEffect } from 'react';
import { 
  Briefcase, CheckCircle, Clock, FileText, Download, 
  ArrowRight, MessageSquare, AlertCircle, Calendar, 
  LogOut, Mail, Lock, Check, Search, Bell
} from 'lucide-react';
import { ClientProject, ProjectMilestone } from '../../types';
import { getProjectByEmail, approveMilestone } from '../../lib/projectService';
import { useAuth } from '../../lib/AuthContext';

export default function ClientDashboard() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [project, setProject] = useState<ClientProject | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If user is already logged in, try to fetch their project automatically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      handleLogin(emailParam);
    } else if (user?.email) {
      handleLogin(user.email);
    }
  }, [user]);

  const handleLogin = async (loginEmail: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      const proj = await getProjectByEmail(loginEmail);
      if (proj) {
        setProject(proj);
      } else {
        setError("No active projects found for this email address. Try 'demo@example.com'.");
      }
    } catch (err) {
      setError('An error occurred while fetching your project.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(email);
  };

  const handleApprove = async (milestoneId: string) => {
    if (!project) return;
    const updatedProject = await approveMilestone(project.id, milestoneId);
    if (updatedProject) {
      setProject(updatedProject);
    }
  };

  const handleLogout = () => {
    setProject(null);
    setEmail('');
    setError('');
  };

  // Login Screen
  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-8 text-center bg-[#000080] text-white">
            <Briefcase className="w-12 h-12 mx-auto mb-4 text-blue-200" />
            <h2 className="text-2xl font-bold">Client Portal Access</h2>
            <p className="text-sm text-blue-200 mt-2">Enter your email to view your project status.</p>
          </div>
          
          <form onSubmit={handleFormSubmit} className="p-8 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all"
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl font-bold shadow-lg shadow-[#000080]/20 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? 'Searching...' : 'Access Dashboard'}
            </button>
            
            <p className="text-center text-xs text-slate-500 mt-4">
              Secure client portal. Use <strong className="text-slate-700">demo@example.com</strong> to view a sample project.
            </p>
          </form>
        </div>
      </div>
    );
  }

  // Helper calculations
  const totalMilestones = project.milestones.length;
  const completedMilestones = project.milestones.filter(m => m.status === 'completed' || m.status === 'approved').length;
  const progressPercent = Math.round((completedMilestones / totalMilestones) * 100);
  
  const targetDate = new Date(project.targetEndDate);
  const now = new Date();
  const daysLeft = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Navbar */}
      <div className="bg-[#000080] text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Briefcase className="w-6 h-6 text-emerald-400" />
            <h1 className="text-lg font-bold tracking-tight">Client Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-white/10 rounded-full transition-colors hidden sm:block">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-400 rounded-full"></span>
            </button>
            <div className="hidden sm:flex items-center gap-2 border-l border-white/20 pl-4">
              <div className="w-8 h-8 bg-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
                {project.clientName.charAt(0)}
              </div>
              <span className="text-sm font-medium">{project.clientName}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="ml-2 p-2 hover:bg-white/10 rounded-full transition-colors text-blue-200 hover:text-white"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{project.projectName}</h2>
            <p className="text-slate-500 mt-1">Project Status & Deliverables Overview</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-semibold shadow-sm transition-all flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Message Team
            </button>
          </div>
        </div>

        {/* Suggestion Banner */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-8 flex items-start gap-4">
          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl shrink-0 mt-0.5">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Action Required: Approve Design Phase</h4>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              We have completed the high-fidelity mockups for your review. Please check the 'Files & Deliverables' section to view the Figma link, and approve the milestone below so we can begin development.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Progress Overview Card */}
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Overall Progress</h3>
              
              <div className="flex items-end justify-between mb-2">
                <span className="text-3xl font-bold text-[#000080]">{progressPercent}%</span>
                <span className="text-sm font-medium text-slate-500">{completedMilestones} of {totalMilestones} Phases Complete</span>
              </div>
              
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-6">
                <div 
                  className="h-full bg-[#000080] rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-bold text-emerald-600 capitalize">{project.status.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Start Date</p>
                  <p className="text-sm font-bold text-slate-900">{new Date(project.startDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Target Launch</p>
                  <p className="text-sm font-bold text-slate-900">{targetDate.toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Time Remaining</p>
                  <p className="text-sm font-bold text-slate-900 flex items-center gap-1">
                    <Clock className="w-4 h-4 text-amber-500" /> {daysLeft} Days
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-8">Project Timeline</h3>
              
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {project.milestones.map((milestone, index) => {
                  const isCompleted = milestone.status === 'completed' || milestone.status === 'approved';
                  const isActive = milestone.status === 'in_progress';
                  const isPending = milestone.status === 'pending';

                  return (
                    <div key={milestone.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      {/* Icon */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${
                        isCompleted ? 'bg-emerald-500 text-white' : 
                        isActive ? 'bg-[#000080] text-white ring-4 ring-blue-100' : 
                        'bg-slate-200 text-slate-400'
                      }`}>
                        {isCompleted ? <Check className="w-5 h-5" /> : <span className="text-sm font-bold">{index + 1}</span>}
                      </div>

                      {/* Content Card */}
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-5 rounded-2xl border transition-all duration-300 hover:shadow-md bg-white shadow-sm
                        ${isActive ? 'border-[#000080] shadow-blue-50' : 'border-slate-200 hover:border-slate-300'}"
                      >
                        <div className="flex flex-col gap-1 mb-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isCompleted ? 'bg-emerald-100 text-emerald-700' :
                              isActive ? 'bg-blue-100 text-[#000080]' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {milestone.status.replace('_', ' ')}
                            </span>
                            {milestone.dueDate && (
                              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> 
                                {new Date(milestone.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          <h4 className={`text-base font-bold mt-1 ${isCompleted ? 'text-slate-900' : isActive ? 'text-[#000080]' : 'text-slate-600'}`}>
                            {milestone.title}
                          </h4>
                        </div>
                        <p className="text-sm text-slate-500 leading-relaxed mb-4">
                          {milestone.description}
                        </p>
                        
                        {/* Action buttons if active or needs approval */}
                        {isActive && (
                          <div className="pt-3 border-t border-slate-100">
                            <button 
                              onClick={() => handleApprove(milestone.id)}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                            >
                              Approve Phase
                            </button>
                          </div>
                        )}
                        {milestone.status === 'approved' && (
                          <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-emerald-600">
                            <CheckCircle className="w-4 h-4" /> Approved by Client
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Side Column */}
          <div className="space-y-8">
            
            {/* Files & Deliverables */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#000080]" /> Files & Deliverables
              </h3>
              
              <div className="space-y-3">
                {project.files.map(file => (
                  <div key={file.id} className="group p-3 border border-slate-200 rounded-xl hover:border-[#000080]/30 hover:bg-slate-50 transition-all flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#000080] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">{file.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                    </div>
                    <a href={file.url} className="p-2 text-slate-400 hover:text-[#000080] hover:bg-blue-50 rounded-lg transition-colors shrink-0">
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
                {project.files.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No files uploaded yet.</p>
                )}
              </div>
            </div>

            {/* Quick Contact */}
            <div className="bg-[#000080] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              
              <h3 className="text-lg font-bold mb-2 relative z-10">Need Assistance?</h3>
              <p className="text-sm text-blue-200 mb-6 relative z-10 leading-relaxed">
                Have questions about your timeline or need to request a change? Our team is here to help.
              </p>
              
              <button className="w-full py-3 bg-white text-[#000080] hover:bg-blue-50 rounded-xl text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 relative z-10">
                <MessageSquare className="w-4 h-4" /> Open Support Chat
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
