import { motion } from 'motion/react';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';
import { Link } from 'react-router-dom';
import { CONTACT_PAGE_PATH } from '../lib/contactCta';

interface CTAProps {
  isLiveEditing?: boolean;
}

export default function CTA({ isLiveEditing = false }: CTAProps) {
  const { content } = useCMS();
  const ctaData = content.cta || {};
  const isEnabled = ctaData.enabled !== false;

  const heading = ctaData.heading || "Let's Create Real Digital Impact";
  const paragraph1 = ctaData.paragraph1 || 'Build better experiences for your customers and simpler systems for your team.';
  const paragraph2 = ctaData.paragraph2 || 'Everything works together, so your business runs smoothly with clarity and momentum.';
  const buttonText = ctaData.buttonText || 'Speak With a Digital Advisor';
  const bgImage = ctaData.bgImage || 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=2000';

  if (!isEnabled && !isLiveEditing) return null;

  const theme = content.theme || {};
  const buttonRadius = theme.buttonRadius || 'rounded-md';
  const headingFont = theme.fontFamily || 'Inter';

  return (
    <section className={`relative py-40 md:py-52 overflow-hidden bg-[#0c0e16] text-white ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <div className="absolute inset-0 z-0">
        <VisualEditable section="cta" field="bgImage" value={bgImage} label="Background Image" type="image" isLiveEditing={isLiveEditing}>
          <img
            src={bgImage}
            alt="Office background"
            className="w-full h-full object-cover opacity-30 transition-transform duration-[1400ms] hover:scale-105"
          />
        </VisualEditable>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e16] via-[#0c0e16]/88 to-[#000080]/30" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-2xl">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl md:text-7xl font-bold text-white tracking-[-0.05em] leading-[1.02] mb-8"
            style={{ fontFamily: headingFont }}
          >
            <VisualEditable section="cta" field="heading" value={heading} label="CTA Heading" isLiveEditing={isLiveEditing}>
              {heading}
            </VisualEditable>
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg text-white/75 mb-6 leading-8"
          >
            <VisualEditable section="cta" field="paragraph1" value={paragraph1} label="Paragraph 1" type="textarea" isLiveEditing={isLiveEditing}>
              {paragraph1}
            </VisualEditable>
          </motion.p>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/75 mb-12 leading-8"
          >
            <VisualEditable section="cta" field="paragraph2" value={paragraph2} label="Paragraph 2" type="textarea" isLiveEditing={isLiveEditing}>
              {paragraph2}
            </VisualEditable>
          </motion.p>

          <VisualEditable section="cta" field="buttonText" value={buttonText} label="Button Text" isLiveEditing={isLiveEditing}>
            <Link to={CONTACT_PAGE_PATH} className={`group inline-flex items-center gap-5 bg-white text-[#000080] pl-8 pr-2 py-2 ${buttonRadius} font-bold text-[15px] hover:-translate-y-1 transition-all shadow-xl`}>
              {buttonText}<span className="grid h-11 w-11 place-items-center rounded-lg bg-[#000080] text-white transition-transform group-hover:rotate-45">&#8599;</span>
            </Link>
          </VisualEditable>
        </div>
      </div>
    </section>
  );
}
