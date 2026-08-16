import { Star } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import { FeedbackEntry } from '../types';

interface HeroReviewProofProps {
  dark?: boolean;
  className?: string;
}

export default function HeroReviewProof({ dark = false, className = '' }: HeroReviewProofProps) {
  const { content } = useCMS();
  const feedbacks: FeedbackEntry[] = Array.isArray(content.feedback_submissions) ? content.feedback_submissions : [];
  const approved = feedbacks.filter((feedback) => feedback.showOnWebsite === true && Number(feedback.rating) > 0);
  if (!approved.length) return null;

  const average = approved.reduce((sum, feedback) => sum + Number(feedback.rating), 0) / approved.length;
  const avatars = [...approved].sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image))).slice(0, 4);

  return (
    <div className={`inline-flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 backdrop-blur-md ${dark ? 'border-white/15 bg-white/10 text-white' : 'border-white/60 bg-white/65 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]'} ${className}`} aria-label={`${average.toFixed(1)} out of 5 from ${approved.length} approved reviews`}>
      <div className="flex shrink-0 -space-x-2.5">
        {avatars.map((feedback, index) => feedback.image ? (
          <img key={feedback.id || index} src={feedback.image} alt={feedback.customerName || 'Client reviewer'} className="h-9 w-9 rounded-full border-2 border-white object-cover shadow-sm" />
        ) : (
          <span key={feedback.id || index} className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-[#000080] text-[11px] font-black uppercase text-white shadow-sm">{(feedback.customerName || 'C').charAt(0)}</span>
        ))}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5" aria-hidden="true">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-3.5 w-3.5 ${average >= star - 0.5 ? 'fill-amber-400 text-amber-400' : dark ? 'fill-white/20 text-white/20' : 'fill-slate-200 text-slate-200'}`} />)}</div>
          <span className="text-xs font-black">{average.toFixed(1)}</span>
        </div>
        <p className={`mt-1 whitespace-nowrap text-[10px] font-semibold ${dark ? 'text-white/70' : 'text-slate-600'}`}>Rated by {approved.length} {approved.length === 1 ? 'client' : 'clients'}</p>
      </div>
    </div>
  );
}
