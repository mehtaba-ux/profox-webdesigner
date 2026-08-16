import { motion, useScroll, useSpring } from 'motion/react';

export default function HomeScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 130, damping: 28, mass: 0.25 });
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-[120] h-[3px] origin-left bg-[#5c5cff]" style={{ scaleX }} />;
}
