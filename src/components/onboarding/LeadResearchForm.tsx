import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, TrainingLesson, TrainingModule, UserProgress } from '../../lib/trainingService';
import LeadResearchTraining from './LeadResearchTraining';

// Kept for compatibility with the existing MyTraining callback signature.
// Module 5 submissions now use the secure lead_research_v2 RPC workflow instead.
export interface ProspectSubmission {
  companyName: string;
  websiteUrl: string;
  country: string;
  industry: string;
  decisionMaker: string;
  contactInfo: string;
  websiteProblem: string;
  recommendedService: string;
  reasonQualified: string;
}

interface LeadResearchFormProps {
  onSubmit: (prospects: ProspectSubmission[]) => void;
  isSubmitting?: boolean;
}

export default function LeadResearchForm(_props: LeadResearchFormProps) {
  const { user } = useAuth();
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [progress, setProgress] = useState<UserProgress | undefined>();
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [modulesRes, progressRes] = await Promise.all([
        trainingService.getModules(),
        trainingService.getUserProgress(user.id)
      ]);
      const target = (modulesRes.data || []).find(item => item.slug === 'lead-research');
      if (!target) throw new Error('Module 5 Lead Research & Qualification was not found.');
      let current = (progressRes.data || []).find(item => item.module_id === target.id);
      if (!current) {
        const started = await trainingService.startModule(user.id, target.id);
        if (started.error || !started.data) throw started.error || new Error('Module 5 could not be started.');
        current = started.data;
      }
      const lessonsRes = await trainingService.getLessons(target.id);
      if (lessonsRes.error && (!lessonsRes.data || lessonsRes.data.length === 0)) throw lessonsRes.error;
      setModule(target);
      setProgress(current);
      setLessons(lessonsRes.data || []);
    } catch (e: any) {
      setError(e?.message || 'Module 5 could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) void load(); }, [user?.id]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (error || !module) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error || 'Module 5 is unavailable.'}</div>;

  return (
    <LeadResearchTraining
      moduleId={module.id}
      lessons={lessons}
      progress={progress}
      completed={progress?.status === 'Passed' || progress?.status === 'Completed'}
      onRefresh={load}
    />
  );
}
