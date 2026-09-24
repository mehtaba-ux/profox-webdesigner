import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, TrainingLesson, TrainingModule, UserProgress } from '../../lib/trainingService';
import ProductPackageTraining from './ProductPackageTraining';

interface ProductQuizProps {
  onComplete?: (answers: number[]) => Promise<{ score: number; passed: boolean; error?: string }>;
  passingScore?: number;
}

/**
 * Legacy ProductQuiz route wrapper.
 *
 * MyTraining historically routes Module 3 through this component. The actual
 * Product & Package Training experience now lives in ProductPackageTraining so
 * sellers receive the same guided lesson → live catalog → assessment flow as
 * the rest of the Sales Academy. The old five-question client-side quiz is no
 * longer used and no answer key is shipped to the browser.
 */
export default function ProductQuiz(_props: ProductQuizProps) {
  const { user } = useAuth();
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [progress, setProgress] = useState<UserProgress | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [moduleResult, progressResult] = await Promise.all([
        trainingService.getModules(),
        trainingService.getUserProgress(user.id)
      ]);
      if (moduleResult.error) throw moduleResult.error;
      if (progressResult.error) throw progressResult.error;

      const target = (moduleResult.data || []).find(item =>
        ['product-training', 'product-package-training', 'product-packages'].includes(item.slug)
      );
      if (!target) throw new Error('Product & Package Training module was not found.');

      const lessonResult = await trainingService.getLessons(target.id);
      if (lessonResult.error) throw lessonResult.error;

      setModule(target);
      setLessons(lessonResult.data || []);
      setProgress((progressResult.data || []).find(item => item.module_id === target.id));
    } catch (err: any) {
      setError(err?.message || 'Product & Package Training could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshProgress = useCallback(async () => {
    if (!user || !module) return;
    const progressResult = await trainingService.getUserProgress(user.id);
    if (progressResult.error) throw progressResult.error;
    setProgress((progressResult.data || []).find(item => item.module_id === module.id));
  }, [user, module]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-[#000080]" />
        <p className="text-sm font-medium text-slate-500">Loading Product & Package Training...</p>
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
        {error || 'Product & Package Training is unavailable.'}
      </div>
    );
  }

  const completed = progress?.status === 'Passed' || progress?.status === 'Completed';

  return (
    <ProductPackageTraining
      moduleId={module.id}
      moduleTitle={module.title}
      moduleDescription={module.description}
      lessons={lessons}
      progress={progress}
      completed={completed}
      onRefresh={refreshProgress}
      onExit={() => window.location.reload()}
    />
  );
}
