import { motion } from 'motion/react';
import { Monitor, Grid, Workflow, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { services as defaultServices } from '../data';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';

const iconMap = {
  monitor: Monitor,
  grid: Grid,
  workflow: Workflow,
};

interface ServicesProps {
  isLiveEditing?: boolean;
}

export default function Services({ isLiveEditing = false }: ServicesProps) {
  const { content } = useCMS();
  const servicesData = content.services || {};
  const isEnabled = servicesData.enabled !== false;
  const sectionTitle = servicesData.title || 'How We Help';
  const sectionSubtitle = servicesData.subtitle || 'Connected digital services designed around the way your customers decide and your team delivers.';
  const serviceList = (servicesData.list && servicesData.list.length > 0) ? servicesData.list : defaultServices;

  if (!isEnabled && !isLiveEditing) return null;

  const theme = content.theme || {};
  const primaryColor = theme.primaryColor || '#000080';
  const headingFont = theme.fontFamily || 'Inter';

  return (
    <section id="services" className={`py-28 md:py-36 bg-white relative z-20 overflow-hidden ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }} className="mb-16 grid gap-8 md:grid-cols-[1.4fr_0.6fr] md:items-end">
          <h2 className="max-w-4xl text-5xl md:text-7xl font-medium text-slate-950 tracking-[-0.055em] leading-[0.98]" style={{ fontFamily: headingFont }}>
            <VisualEditable section="services" field="title" value={sectionTitle} label="Services Title" isLiveEditing={isLiveEditing}>
              {sectionTitle}
            </VisualEditable>
          </h2>
          <p className="max-w-md text-base leading-7 text-slate-600 md:justify-self-end">
            <VisualEditable section="services" field="subtitle" value={sectionSubtitle} label="Services Introduction" type="textarea" isLiveEditing={isLiveEditing}>{sectionSubtitle}</VisualEditable>
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {serviceList.map((service: any, idx: number) => {
            const Icon = iconMap[service.icon as keyof typeof iconMap] || Monitor;
            const destination = service.link || '/contact-us';
            return (
              <motion.article
                key={service.id || idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -10 }}
                className="group relative flex flex-col rounded-[22px] bg-[#f4f6ff] overflow-hidden hover:shadow-2xl transition-shadow min-h-[520px] border border-slate-100 focus-within:ring-4 focus-within:ring-[#000080]/15"
              >
                <Link to={destination} aria-label={`View ${service.title}`} className="absolute inset-0 z-10 rounded-[22px] focus:outline-none" />
                {/* Background Image with Hover Effect */}
                {service.image && (
                  <div className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <div 
                      className="absolute inset-0 transition-transform duration-700 group-hover:scale-110"
                      style={{
                        backgroundImage: `url(${service.image})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    />
                    <div className="absolute inset-0 bg-black/30" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  </div>
                )}

                {/* Content Overlay */}
                <div className="pointer-events-none relative z-20 flex h-full flex-col p-8 md:p-10">
                  <span className="absolute right-0 top-0 text-xs font-black tracking-[0.2em] text-slate-400 group-hover:text-white/60">0{idx + 1}</span>
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform bg-[#000080]">
                    <Icon className="w-7 h-7 text-white" />
                  </div>

                  {/* Spacer to push content down */}
                  <div className="flex-grow" />

                  {/* Text Content */}
                  <div className="mb-8">
                    <h3 className={`text-[28px] font-bold leading-tight transition-colors duration-300 ${service.image ? 'text-slate-900 group-hover:text-white' : 'text-slate-900'}`}>
                      {service.title}
                    </h3>
                    {service.subtitle && (
                      <p className={`mt-4 text-sm leading-relaxed transition-colors duration-300 ${service.image ? 'text-slate-600 group-hover:text-white/80' : 'text-slate-600'}`}>
                        {service.subtitle}
                      </p>
                    )}
                  </div>
                  
                  {/* Action Button */}
                  <div>
                    <span 
                      className={`px-6 py-4 rounded-xl text-[14px] font-bold flex items-center justify-between transition-all w-full bg-[#1a1c1e] text-white group-hover:bg-black group-hover:shadow-lg ${
                        service.image ? 'group-hover:bg-white/10 group-hover:backdrop-blur-md group-hover:border group-hover:border-white/20' : ''
                      }`}
                    >
                      {service.description}
                      <ArrowUpRight className="w-5 h-5" />
                    </span>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
