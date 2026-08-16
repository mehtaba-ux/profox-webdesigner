import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useCMS } from '../lib/CMSProvider';
import Logo from './Logo';

const INTRO_KEY = 'profox-home-intro-seen';

export default function HomePageLoader() {
  const { content } = useCMS();
  const reduceMotion = useReducedMotion();
  const settings = content.loadingScreen || {};
  const enabled = settings.enabled !== false;
  const replayEveryVisit = settings.replayEveryVisit === true;
  const duration = Math.min(4000, Math.max(900, Number(settings.duration) || 1800));
  const logo = settings.logo;
  const taglineLine1 = settings.taglineLine1 || 'Where Design & Technology';
  const taglineLine2 = settings.taglineLine2 || 'Meet Business Impact';
  const backgroundColor = settings.backgroundColor || '#f8f8fb';
  const textColor = settings.textColor || '#111827';
  const accentColor = settings.accentColor || '#000080';
  const separatorColor = settings.separatorColor || '#b6bac5';
  const logoWidth = Math.min(320, Math.max(110, Number(settings.logoWidth) || 190));
  const alreadySeen = useMemo(() => typeof window !== 'undefined' && sessionStorage.getItem(INTRO_KEY) === 'true', []);
  const [visible, setVisible] = useState(enabled && (replayEveryVisit || !alreadySeen));

  useEffect(() => {
    if (!enabled || !visible) {
      const notify = window.setTimeout(() => window.dispatchEvent(new CustomEvent('profox:loader-complete')), 0);
      return () => window.clearTimeout(notify);
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      sessionStorage.setItem(INTRO_KEY, 'true');
      window.dispatchEvent(new CustomEvent('profox:loader-complete'));
      setVisible(false);
      document.body.style.overflow = originalOverflow;
    }, reduceMotion ? 250 : duration);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
    };
  }, [duration, enabled, reduceMotion, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[300] grid place-items-center overflow-hidden"
          style={{ backgroundColor, color: textColor }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.012, filter: 'blur(5px)', transition: { duration: reduceMotion ? 0.1 : 0.42, ease: [0.76, 0, 0.24, 1] } }}
          aria-label="ProFox website loading"
          role="status"
        >
          <motion.div
            aria-hidden
            className="absolute h-[38rem] w-[38rem] rounded-full opacity-[0.09] blur-3xl"
            style={{ backgroundColor: accentColor }}
            initial={{ scale: 0.65 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
          />

          <div className="relative flex items-center justify-center px-6">
            <motion.div
              className="flex items-center justify-end overflow-hidden pr-5 md:pr-7"
              initial={{ clipPath: 'inset(0 0 0 100%)', x: 18, opacity: 0 }}
              animate={{ clipPath: 'inset(0 0 0 0%)', x: 0, opacity: 1 }}
              transition={{ delay: 0.18, duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
            >
              {logo ? (
                <img src={logo} alt="ProFox" className="h-auto object-contain" style={{ width: logoWidth }} />
              ) : (
                <div style={{ width: logoWidth, height: '48px' }} className="flex justify-end">
                  <Logo />
                </div>
              )}
            </motion.div>

            <motion.span
              aria-hidden
              className="h-5 w-px origin-center md:h-10"
              style={{ backgroundColor: separatorColor }}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            />

            <motion.div
              className="overflow-hidden pl-5 md:pl-7"
              initial={{ clipPath: 'inset(0 100% 0 0)', x: -18, opacity: 0 }}
              animate={{ clipPath: 'inset(0 0% 0 0)', x: 0, opacity: 1 }}
              transition={{ delay: 0.18, duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="max-w-[16rem] text-sm font-semibold leading-[1.35] tracking-[-0.02em] md:text-lg">
                <span className="block">{taglineLine1}</span>
                <span className="block">{taglineLine2}</span>
              </p>
            </motion.div>
          </div>

          <motion.div className="absolute bottom-8 h-px w-24 overflow-hidden bg-black/10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
            <motion.div className="h-full" style={{ backgroundColor: accentColor }} initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: Math.max(0.65, duration / 1000 - 0.55), delay: 0.35, ease: 'easeInOut' }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
