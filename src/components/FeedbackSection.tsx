import React from 'react';
import { motion } from 'motion/react';
import { Quote, Star, MessageSquare, ArrowRight, Plus, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCMS } from '../lib/CMSProvider';
import { FeedbackEntry } from '../types';
import VisualEditable from './admin/VisualEditable';

interface FeedbackSectionProps {
  isLiveEditing?: boolean;
}

interface MarqueeRowProps {
  feedbacks: FeedbackEntry[];
  direction: 'left' | 'right';
  speed: number;
}

function MarqueeRow({ feedbacks, direction, speed }: MarqueeRowProps) {
  if (feedbacks.length === 0) return null;

  // Repeat items to ensure a long enough track, then duplicate the whole array for -50% loop
  const baseItems = feedbacks.length < 4 ? [...feedbacks, ...feedbacks, ...feedbacks, ...feedbacks] : feedbacks;
  const loopItems = [...baseItems, ...baseItems];

  return (
    <div className="relative flex w-full overflow-hidden py-4 group">
      <div 
        className={`flex gap-8 shrink-0 w-max ${
          direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right'
        } group-hover:[animation-play-state:paused]`}
        style={{ animationDuration: `${speed}s` }}
      >
        {loopItems.map((fb, idx) => (
          <div key={`${fb.id}-${idx}`} className="shrink-0">
            <FeedbackCard fb={fb} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackCard({ fb }: { fb: FeedbackEntry }) {
  const hasValidImage = fb.image && fb.image.trim() !== '';

  return (
    <div
      className="w-[380px] h-[300px] shrink-0 p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-[#000080]/20 transition-all duration-300 relative group/card flex flex-col justify-between"
    >
      <div className="space-y-4 overflow-hidden flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-4 h-4 ${
                  fb.rating >= s
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-slate-200'
                }`}
              />
            ))}
          </div>
          <Quote className="w-8 h-8 text-[#000080]/15 group-hover/card:text-[#000080]/30 transition-colors" />
        </div>

        <p className="text-slate-700 text-sm md:text-base leading-relaxed italic font-serif whitespace-normal line-clamp-5">
          "{fb.comment}"
        </p>
      </div>

      <div className="flex items-center gap-4 pt-4 mt-4 border-t border-slate-100 shrink-0">
        {hasValidImage ? (
          <img
            src={fb.image}
            alt={fb.customerName}
            className="w-10 h-10 rounded-full object-cover border-2 border-[#000080]/30"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#000080]/10 text-[#000080] font-bold text-base flex items-center justify-center border-2 border-[#000080]/20 uppercase shrink-0">
            {fb.customerName ? fb.customerName.charAt(0) : 'U'}
          </div>
        )}

        <div className="overflow-hidden flex-1">
          <div className="font-bold text-slate-900 text-sm md:text-base truncate">
            {fb.customerName || 'Valued Client'}
          </div>
          {fb.position ? (
            <p className="text-xs text-slate-500 truncate">{fb.position}</p>
          ) : (
            <p className="text-xs text-slate-400 truncate">
              {new Date(fb.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                year: 'numeric',
              })}
            </p>
          )}
          {fb.link && (
            <a
              href={fb.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#000080] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Visit Link
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


export default function FeedbackSection({ isLiveEditing = false }: FeedbackSectionProps) {
  const { content } = useCMS();
  
  const feedbacks: FeedbackEntry[] = Array.isArray(content.feedback_submissions) 
    ? content.feedback_submissions 
    : [];

  const feedbackConfig = content.feedback_config || { scrollSpeed: 40 };
  const scrollSpeed = feedbackConfig.scrollSpeed || 40;

  // Filter ONLY feedbacks approved by admin to show on the website
  const approvedFeedbacks = feedbacks.filter(
    (fb) => fb.showOnWebsite === true && fb.comment && fb.comment.trim().length > 0
  );

  return (
    <section className="py-24 bg-gradient-to-b from-slate-50 to-white relative overflow-hidden border-y border-slate-100">
      {/* Background Decorative Accents */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#000080]/5 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="max-w-[1400px] mx-auto px-6 relative z-10 space-y-16">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <span className="inline-block text-xs font-bold text-[#000080] uppercase tracking-widest bg-[#000080]/10 border border-[#000080]/20 px-3.5 py-1.5 rounded-full">
              Client Feedback
            </span>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              What Our Clients Say
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed font-normal">
              Real feedback and reviews approved from our clients and partners.
            </p>
          </div>

          <Link
            to="/leave-feedback"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#000080] text-white font-bold text-sm rounded-xl hover:bg-[#000066] transition-all shadow-md shadow-[#000080]/10 shrink-0 hover:scale-[1.02]"
          >
            <MessageSquare className="w-4 h-4" />
            Leave Your Feedback
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {/* Feedback Marquee */}
        {approvedFeedbacks.length > 0 ? (
          <div className="space-y-4 -mx-6 overflow-hidden">
            {/* Row 1: Slide Left */}
            <div className="overflow-hidden">
              <MarqueeRow 
                feedbacks={approvedFeedbacks.filter((_, idx) => idx % 2 === 0)} 
                direction="left" 
                speed={scrollSpeed}
              />
            </div>
            
            {/* Row 2: Slide Right */}
            <div className="overflow-hidden">
              <MarqueeRow 
                feedbacks={approvedFeedbacks.filter((_, idx) => idx % 2 !== 0)} 
                direction="right" 
                speed={scrollSpeed + 5} // Slightly different for visual rhythm
              />
            </div>
          </div>
        ) : (
          /* Empty / Unapproved State */
          <div className="p-12 rounded-3xl bg-white border border-slate-200/80 text-center space-y-6 max-w-2xl mx-auto shadow-sm">
            <div className="w-16 h-16 bg-[#000080]/10 text-[#000080] rounded-2xl flex items-center justify-center mx-auto">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-900">No Approved Feedback Yet</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                Customer feedback submitted via our feedback form will appear here once approved in the admin dashboard.
              </p>
            </div>
            <Link
              to="/leave-feedback"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#000080] text-white font-bold text-sm rounded-xl hover:bg-[#000066] transition-all"
            >
              Submit First Review
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
