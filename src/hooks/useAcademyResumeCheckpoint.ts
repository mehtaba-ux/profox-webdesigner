import { useCallback, useEffect, useRef, useState } from 'react';
import { AcademyResumeCheckpoint, academyResumeService } from '../lib/academyResumeService';

export function useAcademyResumeCheckpoint<T extends AcademyResumeCheckpoint = AcademyResumeCheckpoint>(moduleId?: string | null) {
  const [checkpoint, setCheckpoint] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setCheckpoint(null);
    setReady(false);

    if (!moduleId) {
      setReady(true);
      return () => { cancelled = true; };
    }

    void academyResumeService.get(moduleId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error('Unable to load Academy resume checkpoint:', error);
      setCheckpoint((data as T | null) || null);
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [moduleId]);

  const saveNow = useCallback(async (value: T) => {
    if (!moduleId || !ready) return;
    const { error } = await academyResumeService.save(moduleId, value);
    if (error) console.error('Unable to save Academy resume checkpoint:', error);
  }, [moduleId, ready]);

  const save = useCallback((value: T, delay = 350) => {
    if (!moduleId || !ready) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void academyResumeService.save(moduleId, value).then(({ error }) => {
        if (error) console.error('Unable to save Academy resume checkpoint:', error);
      });
    }, Math.max(0, delay));
  }, [moduleId, ready]);

  const clear = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setCheckpoint(null);
    if (!moduleId) return;
    const { error } = await academyResumeService.clear(moduleId);
    if (error) console.error('Unable to clear Academy resume checkpoint:', error);
  }, [moduleId]);

  return { checkpoint, ready, save, saveNow, clear };
}

export function useAcademyResumeSync<T extends AcademyResumeCheckpoint>(
  moduleId: string | null | undefined,
  enabled: boolean,
  snapshot: T,
  restore: (checkpoint: T | null) => void,
  delay = 350
) {
  const resume = useAcademyResumeCheckpoint<T>(moduleId);
  const [applied, setApplied] = useState(false);
  const serialized = JSON.stringify(snapshot);

  useEffect(() => { setApplied(false); }, [moduleId]);

  useEffect(() => {
    if (!resume.ready || applied) return;
    restore(resume.checkpoint);
    setApplied(true);
    // Restore is intentionally consumed once per module load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.ready, applied, moduleId]);

  useEffect(() => {
    if (!resume.ready || !applied || !enabled) return;
    resume.save(snapshot, delay);
    // serialized is the stable content dependency for the checkpoint payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.ready, applied, enabled, serialized, moduleId, delay]);

  return { ready: resume.ready && applied, clear: resume.clear, saveNow: resume.saveNow };
}
