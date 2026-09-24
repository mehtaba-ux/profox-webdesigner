import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  Search,
  Eye,
  Check,
  X,
  FileText,
  UserCheck,
  ArrowRight,
  Loader2,
  RefreshCw,
  Award,
  ExternalLink,
  Video,
  ListChecks,
  CheckSquare,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Settings,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { trainingService, UserProgress, TrainingModule, TrainingLesson } from '../../lib/trainingService';
import { profileService } from '../../lib/profileService';
import { useAuth } from '../../lib/AuthContext';
import { UserProfile } from '../../types';

export default function OnboardingManagement() {
  const { user: adminUser } = useAuth();
  
  // Tab state: candidates vs curriculum
  const [activeTab, setActiveTab] = useState<'candidates' | 'curriculum'>('candidates');

  // Candidates state
  const [candidates, setCandidates] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userProgress, setUserProgress] = useState<UserProgress[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState<UserProgress | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [mockScore, setMockScore] = useState<number>(85);
  const [isActivating, setIsActivating] = useState(false);

  // Curriculum Editor state
  const [curriculumSearch, setCurriculumSearch] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Partial<TrainingModule> | null>(null);
  const [isSavingModule, setIsSavingModule] = useState(false);
  
  // Lesson Editor state
  const [isLessonsDrawerOpen, setIsLessonsDrawerOpen] = useState(false);
  const [currentModuleForLessons, setCurrentModuleForLessons] = useState<TrainingModule | null>(null);
  const [moduleLessons, setModuleLessons] = useState<TrainingLesson[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Partial<TrainingLesson> | null>(null);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [isSavingLesson, setIsSavingLesson] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await profileService.getAllProfiles();
      const onboardingProfiles = (profiles || []).filter(p => 
        p.status === 'onboarding' || 
        (p.status === 'pending' && (p.role === 'sales_rep' || p.role === 'sales' || p.role === 'sales_team')) ||
        p.onboardingStatus === 'not_started' || p.onboardingStatus === 'in_progress'
      );
      setCandidates(onboardingProfiles);

      const { data: moduleData } = await trainingService.getModules(true);
      setModules(moduleData || []);
    } catch (err) {
      console.error('Error loading onboarding data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (user: UserProfile) => {
    setSelectedUser(user);
    setLoading(true);
    try {
      const { data: progress } = await trainingService.getUserProgress(user.id);
      setUserProgress(progress || []);
    } catch (err) {
      console.error('Error loading user progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (progress: UserProgress) => {
    setSelectedProgress(progress);
    setIsReviewing(true);
    setReviewFeedback('');
    setMockScore(85);
  };

  const submitReview = async (status: 'Passed' | 'Retry Required') => {
    if (!selectedProgress || !adminUser) return;
    
    setLoading(true);
    try {
      const finalScore = selectedProgress.module?.slug === 'mock-sales-call-test' ? mockScore : undefined;
      const finalStatus = (finalScore !== undefined && finalScore < 75) ? 'Retry Required' : status;

      const { error } = await trainingService.reviewAssignment(
        selectedProgress.id,
        adminUser.id,
        finalStatus,
        reviewFeedback,
        finalScore
      );
      
      if (error) throw error;
      
      if (selectedUser) {
        const { data: progress } = await trainingService.getUserProgress(selectedUser.id);
        setUserProgress(progress || []);
      }
      
      setIsReviewing(false);
      setSelectedProgress(null);
    } catch (err) {
      console.error('Error submitting review:', err);
      alert('Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!selectedUser || !adminUser) return;
    
    if (!confirm(`Are you sure you want to activate ${selectedUser.fullName}? This will grant them full access to the CRM and mark their onboarding as completed.`)) {
      return;
    }

    setIsActivating(true);
    try {
      const { error } = await trainingService.activateSalesperson(selectedUser.id, adminUser.id);
      if (error) throw error;
      
      alert('Representative activated successfully!');
      setSelectedUser(null);
      loadData();
    } catch (err) {
      console.error('Error activating user:', err);
      alert('Activation failed');
    } finally {
      setIsActivating(false);
    }
  };

  // Module CRUD handlers
  const handleOpenNewModule = () => {
    setEditingModule({
      title: '',
      slug: '',
      description: '',
      module_type: 'lesson',
      sort_order: (modules.length > 0 ? Math.max(...modules.map(m => m.sort_order)) + 1 : 1),
      required: true,
      active: true,
      passing_score: 80,
      requires_admin_review: false
    });
    setIsModuleModalOpen(true);
  };

  const handleEditModule = (mod: TrainingModule) => {
    setEditingModule({ ...mod });
    setIsModuleModalOpen(true);
  };

  const handleSaveModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule || !editingModule.title) return;

    setIsSavingModule(true);
    try {
      if (editingModule.id) {
        await trainingService.updateModule(editingModule.id, editingModule);
      } else {
        const slug = editingModule.slug || editingModule.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await trainingService.createModule({
          ...editingModule,
          slug
        });
      }
      await loadData();
      setIsModuleModalOpen(false);
      setEditingModule(null);
    } catch (err) {
      console.error('Error saving module:', err);
      alert('Failed to save module');
    } finally {
      setIsSavingModule(false);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Are you sure you want to delete or deactivate this training module?')) return;
    try {
      await trainingService.deleteModule(moduleId);
      await loadData();
    } catch (err) {
      console.error('Error deleting module:', err);
      alert('Failed to delete module');
    }
  };

  // Lessons handlers
  const handleOpenLessons = async (mod: TrainingModule) => {
    setCurrentModuleForLessons(mod);
    setIsLessonsDrawerOpen(true);
    setIsLoadingLessons(true);
    try {
      const { data } = await trainingService.getLessons(mod.id);
      setModuleLessons(data || []);
    } catch (err) {
      console.error('Error loading lessons:', err);
    } finally {
      setIsLoadingLessons(false);
    }
  };

  const handleOpenNewLesson = () => {
    if (!currentModuleForLessons) return;
    setEditingLesson({
      module_id: currentModuleForLessons.id,
      title: '',
      content: '',
      video_url: '',
      sort_order: (moduleLessons.length > 0 ? Math.max(...moduleLessons.map(l => l.sort_order)) + 1 : 1),
      active: true
    });
    setIsLessonModalOpen(true);
  };

  const handleEditLesson = (lesson: TrainingLesson) => {
    setEditingLesson({ ...lesson });
    setIsLessonModalOpen(true);
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson || !editingLesson.title || !currentModuleForLessons) return;

    setIsSavingLesson(true);
    try {
      await trainingService.saveLesson({
        ...editingLesson,
        module_id: currentModuleForLessons.id
      });
      const { data } = await trainingService.getLessons(currentModuleForLessons.id);
      setModuleLessons(data || []);
      setIsLessonModalOpen(false);
      setEditingLesson(null);
    } catch (err) {
      console.error('Error saving lesson:', err);
      alert('Failed to save lesson');
    } finally {
      setIsSavingLesson(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!currentModuleForLessons) return;
    if (!confirm('Are you sure you want to delete this lesson?')) return;
    try {
      await trainingService.deleteLesson(currentModuleForLessons.id, lessonId);
      const { data } = await trainingService.getLessons(currentModuleForLessons.id);
      setModuleLessons(data || []);
    } catch (err) {
      console.error('Error deleting lesson:', err);
      alert('Failed to delete lesson');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Passed':
      case 'Completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'Submitted': return 'bg-[#000080]/10 text-[#000080] border-[#000080]/30';
      case 'Retry Required': return 'bg-red-100 text-red-700 border-red-200';
      case 'In Progress': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const filteredCandidates = candidates.filter(c => 
    c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredModules = modules.filter(m => {
    const matchesSearch = m.title.toLowerCase().includes(curriculumSearch.toLowerCase()) ||
      m.description.toLowerCase().includes(curriculumSearch.toLowerCase()) ||
      m.slug.toLowerCase().includes(curriculumSearch.toLowerCase());
    const matchesType = selectedTypeFilter === 'all' || m.module_type === selectedTypeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Sales Admin Portal</div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Academy & Onboarding Hub</h1>
          <p className="text-slate-500 text-xs">Review assignments, grade candidates, activate representatives, and customize training modules & lessons.</p>
        </div>
        
        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('candidates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'candidates' 
                ? 'bg-white text-[#000080] shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Candidates & Reviews</span>
            {candidates.length > 0 && (
              <span className="bg-[#000080]/10 text-[#000080] text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
                {candidates.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('curriculum')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'curriculum' 
                ? 'bg-white text-[#000080] shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Curriculum & Module Editor</span>
            <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
              {modules.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================
          TAB 1: CANDIDATES & ONBOARDING REVIEWS
      ======================================================== */}
      {activeTab === 'candidates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Candidates List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search candidates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080]"
                  />
                </div>
                <button 
                  onClick={loadData}
                  className="p-2 ml-2 hover:bg-slate-200/50 rounded-xl text-slate-500 transition-all cursor-pointer"
                  title="Refresh Candidates"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {loading && candidates.length === 0 ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Loading candidates...</p>
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No pending onboarding candidates found.
                  </div>
                ) : (
                  filteredCandidates.map(candidate => (
                    <button
                      key={candidate.id}
                      onClick={() => handleSelectUser(candidate)}
                      className={`w-full p-4 flex items-center gap-3 hover:bg-slate-50 transition-all text-left cursor-pointer ${selectedUser?.id === candidate.id ? 'bg-[#000080]/5 border-l-4 border-l-[#000080]' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                        {candidate.fullName ? candidate.fullName[0] : 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-xs truncate">{candidate.fullName}</div>
                        <div className="text-[11px] text-slate-500 truncate">{candidate.email}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${getStatusColor(candidate.status)}`}>
                            {candidate.status}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {candidate.onboardingProgress || 0}% complete
                          </span>
                        </div>
                      </div>
                      <ArrowRight className={`w-4 h-4 text-slate-300 ${selectedUser?.id === candidate.id ? 'text-[#000080]' : ''}`} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* User Detail & Progress */}
          <div className="lg:col-span-2">
            {selectedUser ? (
              <div className="space-y-6">
                {/* Header Info */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-[#000080]/10 text-[#000080] flex items-center justify-center text-2xl font-bold border border-[#000080]/20 shadow-sm">
                        {selectedUser.fullName ? selectedUser.fullName[0] : 'U'}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{selectedUser.fullName}</h2>
                        <p className="text-xs text-slate-500">{selectedUser.email}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                            <Users className="w-3.5 h-3.5 text-[#000080]" />
                            Role: {selectedUser.role}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Joined: {new Date(selectedUser.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center md:items-end gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#000080]">
                        <Award className="w-4 h-4" />
                        {selectedUser.onboardingProgress || 0}% Progress
                      </div>
                      <div className="w-48 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div 
                          className="h-full bg-gradient-to-r from-[#000080] to-[#FF0E0E] transition-all duration-500" 
                          style={{ width: `${selectedUser.onboardingProgress || 0}%` }}
                        />
                      </div>
                      <button
                        onClick={handleActivate}
                        disabled={isActivating || selectedUser.status === 'active'}
                        className={`mt-2 flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg ${
                          selectedUser.status === 'active'
                            ? 'bg-green-500 text-white cursor-not-allowed'
                            : 'bg-[#000080] text-white hover:bg-[#000066] active:scale-95'
                        } disabled:opacity-50 cursor-pointer`}
                      >
                        {isActivating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : selectedUser.status === 'active' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                        {selectedUser.status === 'active' ? 'Account Active' : 'Approve & Activate Representative'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Timeline */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-[#000080]" />
                      Onboarding Modules Transcript ({modules.length})
                    </h3>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {modules.map(module => {
                      const progress = userProgress.find(p => p.module_id === module.id);
                      return (
                        <div key={module.id} className="p-4 hover:bg-slate-50/50 transition-all flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border shrink-0 ${
                              progress?.status === 'Passed' || progress?.status === 'Completed'
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}>
                              {module.sort_order}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-xs truncate">{module.title}</span>
                                {module.requires_admin_review && (
                                  <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 font-extrabold uppercase tracking-tight">
                                    Review
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">{module.description}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border ${getStatusColor(progress?.status || 'Not Started')}`}>
                              {progress?.status || 'Not Started'}
                            </span>
                            
                            {(module.requires_admin_review || module.module_type === 'assignment') && progress?.status === 'Submitted' && (
                              <button
                                onClick={() => handleReview(progress)}
                                className="px-3.5 py-1.5 bg-[#000080] text-white rounded-xl text-xs font-bold hover:bg-[#000066] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" /> Review Submission
                              </button>
                            )}

                            {(progress?.status === 'Passed' || progress?.status === 'Completed') && (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                  <Users className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-900">Select an Onboarding Candidate</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Choose a sales candidate from the left directory to inspect their submission records and execute activation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: ACADEMY CURRICULUM & MODULE EDITOR
      ======================================================== */}
      {activeTab === 'curriculum' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 flex-1">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search modules..."
                  value={curriculumSearch}
                  onChange={(e) => setCurriculumSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white"
                />
              </div>

              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-[#000080]"
              >
                <option value="all">All Types</option>
                <option value="lesson">Lessons</option>
                <option value="quiz">Quizzes</option>
                <option value="assignment">Assignments</option>
                <option value="practical">Practical Tests</option>
              </select>
            </div>

            <button
              onClick={handleOpenNewModule}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#000080] text-white rounded-xl text-xs font-bold hover:bg-[#000066] transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Training Module</span>
            </button>
          </div>

          {/* Modules Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredModules.map((mod) => (
              <div 
                key={mod.id}
                className={`bg-white rounded-2xl border p-5 transition-all space-y-4 hover:shadow-md ${
                  mod.active !== false ? 'border-slate-200' : 'border-slate-200 bg-slate-50/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#000080] border border-blue-200 flex items-center justify-center font-bold text-sm shrink-0">
                      {mod.sort_order}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{mod.title}</h3>
                      <p className="text-[11px] font-mono text-slate-400">/{mod.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditModule(mod)}
                      className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-all cursor-pointer"
                      title="Edit Module Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteModule(mod.id)}
                      className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all cursor-pointer"
                      title="Delete / Deactivate Module"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {mod.description || 'No description provided.'}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase tracking-tight">
                    {mod.module_type}
                  </span>

                  {mod.requires_admin_review && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      Requires Review
                    </span>
                  )}

                  {mod.passing_score && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#000080] border border-blue-200">
                      Pass: {mod.passing_score}%
                    </span>
                  )}

                  {mod.required ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      Required
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Optional</span>
                  )}

                  <div className="ml-auto">
                    <button
                      onClick={() => handleOpenLessons(mod)}
                      className="text-xs font-bold text-[#000080] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Manage Lessons & Content</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADD / EDIT TRAINING MODULE
      ======================================================== */}
      {isModuleModalOpen && editingModule && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 space-y-6 p-6">
            <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#000080]/10 text-[#000080] flex items-center justify-center border border-[#000080]/20">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingModule.id ? 'Edit Training Module' : 'Create New Training Module'}
                  </h3>
                  <p className="text-xs text-slate-500">Configure curriculum parameters and evaluation requirements.</p>
                </div>
              </div>
              <button onClick={() => setIsModuleModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveModule} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Module Title</label>
                <input
                  type="text"
                  required
                  value={editingModule.title || ''}
                  onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })}
                  placeholder="e.g., Cold Calling Masterclass & Objection Handling"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Slug (Unique URL Identifier)</label>
                  <input
                    type="text"
                    value={editingModule.slug || ''}
                    onChange={(e) => setEditingModule({ ...editingModule, slug: e.target.value })}
                    placeholder="e.g., cold-calling-masterclass"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Sort Order (Sequence)</label>
                  <input
                    type="number"
                    min={1}
                    value={editingModule.sort_order || 1}
                    onChange={(e) => setEditingModule({ ...editingModule, sort_order: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Description</label>
                <textarea
                  value={editingModule.description || ''}
                  onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })}
                  placeholder="Briefly describe what the trainee will learn or accomplish in this module..."
                  className="w-full h-20 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Module Type</label>
                  <select
                    value={editingModule.module_type || 'lesson'}
                    onChange={(e) => setEditingModule({ ...editingModule, module_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white font-medium"
                  >
                    <option value="lesson">Lesson (Educational)</option>
                    <option value="quiz">Quiz (Multiple Choice)</option>
                    <option value="assignment">Assignment (Video / Dossier Submission)</option>
                    <option value="practical">Practical (CRM / Tooling Test)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Passing Score (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editingModule.passing_score || 80}
                    onChange={(e) => setEditingModule({ ...editingModule, passing_score: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white"
                  />
                </div>
              </div>

              {/* Flags */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingModule.required !== false}
                    onChange={(e) => setEditingModule({ ...editingModule, required: e.target.checked })}
                    className="rounded text-[#000080] focus:ring-0 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-800">Mandatory for Final Activation</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingModule.requires_admin_review)}
                    onChange={(e) => setEditingModule({ ...editingModule, requires_admin_review: e.target.checked })}
                    className="rounded text-[#000080] focus:ring-0 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-800">Requires Manual Admin Review & Grading</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingModule.active !== false}
                    onChange={(e) => setEditingModule({ ...editingModule, active: e.target.checked })}
                    className="rounded text-[#000080] focus:ring-0 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-800">Module Active & Visible to Trainees</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModuleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingModule}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#000080] text-white rounded-xl text-xs font-bold hover:bg-[#000066] shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {isSavingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Module</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          DRAWER: LESSONS & CONTENT MANAGEMENT
      ======================================================== */}
      {isLessonsDrawerOpen && currentModuleForLessons && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 space-y-6 p-6 max-h-[90vh] flex flex-col">
            <div className="border-b border-slate-100 pb-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Module Lessons & Content</h3>
                  <p className="text-xs text-slate-500">
                    {currentModuleForLessons.sort_order}. {currentModuleForLessons.title}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenNewLesson}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#000080] text-white rounded-xl text-xs font-bold hover:bg-[#000066] transition-all shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Lesson</span>
                </button>
                <button onClick={() => setIsLessonsDrawerOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Lessons List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isLoadingLessons ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Loading module lessons...</p>
                </div>
              ) : moduleLessons.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">No lessons attached yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">Add lessons, video guides, and markdown study material for this module.</p>
                </div>
              ) : (
                moduleLessons.map((lesson) => (
                  <div key={lesson.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 hover:border-slate-300 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                          {lesson.sort_order}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900">{lesson.title}</h4>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditLesson(lesson)}
                          className="p-1.5 hover:bg-white text-slate-600 rounded-lg transition-all border border-transparent hover:border-slate-200 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLesson(lesson.id)}
                          className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-all border border-transparent hover:border-red-200 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {lesson.video_url && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#000080] font-mono bg-blue-50/60 px-2 py-1 rounded-lg border border-blue-100">
                        <Video className="w-3 h-3 shrink-0" />
                        <span className="truncate">{lesson.video_url}</span>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                      {lesson.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADD / EDIT INDIVIDUAL LESSON
      ======================================================== */}
      {isLessonModalOpen && editingLesson && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 space-y-6 p-6 max-h-[90vh] flex flex-col">
            <div className="border-b border-slate-100 pb-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#000080]/10 text-[#000080] flex items-center justify-center border border-[#000080]/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingLesson.id ? 'Edit Lesson' : 'Create New Lesson'}
                  </h3>
                  <p className="text-xs text-slate-500">Provide training content, study guidance, and video URLs.</p>
                </div>
              </div>
              <button onClick={() => setIsLessonModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveLesson} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Lesson Title</label>
                  <input
                    type="text"
                    required
                    value={editingLesson.title || ''}
                    onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
                    placeholder="e.g., Positioning Strategy & Key Value Props"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Sort Order</label>
                  <input
                    type="number"
                    min={1}
                    value={editingLesson.sort_order || 1}
                    onChange={(e) => setEditingLesson({ ...editingLesson, sort_order: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Optional Video Guide URL (Loom / YouTube / Vimeo)</label>
                <input
                  type="text"
                  value={editingLesson.video_url || ''}
                  onChange={(e) => setEditingLesson({ ...editingLesson, video_url: e.target.value })}
                  placeholder="https://www.loom.com/share/..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Lesson Content (Markdown Supported)</label>
                <textarea
                  required
                  rows={10}
                  value={editingLesson.content || ''}
                  onChange={(e) => setEditingLesson({ ...editingLesson, content: e.target.value })}
                  placeholder="Write clear, comprehensive educational material, action steps, discovery question matrices, and playbooks..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] focus:bg-white font-sans leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLessonModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingLesson}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#000080] text-white rounded-xl text-xs font-bold hover:bg-[#000066] shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {isSavingLesson ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Lesson</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ADMIN REVIEW SUBMISSION
      ======================================================== */}
      {isReviewing && selectedProgress && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 space-y-6 p-6">
            <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#000080]/10 text-[#000080] flex items-center justify-center border border-[#000080]/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Review Candidate Submission</h3>
                  <p className="text-xs text-slate-500">{selectedProgress.module?.title || 'Assignment Review'}</p>
                </div>
              </div>
              <button onClick={() => setIsReviewing(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Rendered Submission Payload Preview */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 max-h-80 overflow-y-auto">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Submitted Payload</div>
              {selectedProgress.submission_data?.type === 'loom_outreach' ? (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-700">Loom Video Link:</span>
                    <a
                      href={selectedProgress.submission_data.loomUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 bg-[#000080] text-white font-bold rounded-lg text-xs flex items-center gap-1.5"
                    >
                      <span>Watch Video</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  {selectedProgress.submission_data.notes && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-700">
                      <span className="font-bold block mb-1">Practice Notes:</span>
                      {selectedProgress.submission_data.notes}
                    </div>
                  )}
                </div>
              ) : selectedProgress.submission_data?.type === 'lead_research' ? (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-700">Submitted 5 Prospects:</div>
                  {(selectedProgress.submission_data.prospects || []).map((p: any, i: number) => (
                    <div key={i} className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="font-bold text-slate-900">{i + 1}. {p.companyName} ({p.websiteUrl})</div>
                      <div className="text-slate-500">Decision Maker: {p.decisionMaker} | Industry: {p.industry}</div>
                      <div className="text-slate-700"><strong>Problem:</strong> {p.websiteProblem}</div>
                      <div className="text-slate-700"><strong>Qualified Reason:</strong> {p.reasonQualified}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="p-3 bg-white rounded-xl border border-slate-200 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                  {JSON.stringify(selectedProgress.submission_data || selectedProgress, null, 2)}
                </pre>
              )}
            </div>

            {/* Score input for Mock Call test */}
            {selectedProgress.module?.slug === 'mock-sales-call-test' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-amber-900 block">Mock Call Score (out of 100, Pass threshold: 75)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={mockScore}
                  onChange={(e) => setMockScore(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800">Review Feedback / Notes for Candidate</label>
              <textarea
                value={reviewFeedback}
                onChange={(e) => setReviewFeedback(e.target.value)}
                placeholder="Provide constructive feedback..."
                className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#000080] resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => submitReview('Retry Required')}
                disabled={loading}
                className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl text-xs border border-red-200 hover:bg-red-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <X className="w-4 h-4" /> Request Retry
              </button>
              <button
                onClick={() => submitReview('Passed')}
                disabled={loading}
                className="flex-1 py-3 bg-[#000080] text-white font-bold rounded-xl text-xs hover:bg-[#000066] transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Pass Module
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
