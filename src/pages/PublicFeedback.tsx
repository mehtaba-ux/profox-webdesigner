import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, MessageSquare, ExternalLink, CheckCircle2, ArrowRight } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import { submitPublicFeedback } from '../lib/supabase';
import { FeedbackEntry } from '../types';

type FlowStep = 'rating' | 'positive_thanks' | 'internal_feedback' | 'success';

const LeaveFeedback: React.FC = () => {
  const { content, updateSection } = useCMS();
  const [step, setStep] = useState<FlowStep>('rating');
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const siteSettings = content.siteSettings || {};
  const businessName = siteSettings.businessName || 'Profox web designer';
  const googleReviewUrl = siteSettings.googleReviewUrl || 'https://google.com/search?q=profox+web+designer+reviews';

  const handleRatingClick = (selectedRating: number) => {
    setRating(selectedRating);
    setStep('internal_feedback');
  };

  const handleSubmitInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !comment || rating === 0) return;
    setIsSubmitting(true);

    try {
      const newFeedback: FeedbackEntry = {
        id: `fb-${Date.now()}`,
        customerName: name,
        customerEmail: email || 'client@example.com',
        rating: rating,
        comment: comment,
        status: 'pending',
        showOnWebsite: false, // Requires admin approval to reflect on homepage
        createdAt: new Date().toISOString(),
      };

      const existingData = content.feedback_submissions;
      const existingFeedback = Array.isArray(existingData) ? existingData : [];
      const updatedList = [newFeedback, ...existingFeedback];
      
      // Save to Supabase and update CMS local state
      const { error } = await submitPublicFeedback(updatedList);
      if (error) {
        console.warn('Supabase submit warning, updating local CMS state:', error);
      }
      await updateSection('feedback_submissions', updatedList);
      
      if (rating >= 4) {
        setStep('positive_thanks');
      } else {
        setStep('success');
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      alert('There was an error submitting your feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pt-32 pb-12 px-6">
      <div className="my-auto max-w-md w-full bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100">
        <div className="p-8 md:p-12">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-[#000080]/5 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-[#000080]" />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === 'rating' && (
              <motion.div
                key="rating"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center"
              >
                <h1 className="text-2xl font-bold text-slate-900 mb-2">How was your experience?</h1>
                <p className="text-slate-500 mb-8">We'd love to hear how we're doing. Tap a star to rate us.</p>
                
                <div className="flex items-center justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => handleRatingClick(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="p-1 transition-all hover:scale-110 active:scale-95"
                    >
                      <Star
                        className={`w-10 h-10 ${
                          (hoveredRating || rating) >= star
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-slate-200'
                        } transition-colors`}
                      />
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                  <span>Needs Improvement</span>
                  <span>Excellent</span>
                </div>
              </motion.div>
            )}

            {step === 'positive_thanks' && (
              <motion.div
                key="positive"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">That's wonderful to hear!</h2>
                <p className="text-slate-600 mb-8">
                  We're so glad you had a great experience with {businessName}. Would you mind sharing your feedback with others?
                </p>
                
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-full bg-[#000080] text-white font-bold py-4 px-8 rounded-xl hover:bg-[#000066] transition-all shadow-lg shadow-[#000080]/20 gap-2 group"
                >
                  Leave a Google Review
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
                
                <button 
                  onClick={() => setStep('rating')}
                  className="mt-6 text-sm text-slate-400 font-semibold hover:text-slate-600 transition-colors"
                >
                  Go Back
                </button>
              </motion.div>
            )}

            {step === 'internal_feedback' && (
              <motion.div
                key="internal"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  {rating >= 4 ? 'Share your experience' : 'How can we improve?'}
                </h2>
                <p className="text-slate-500 text-sm mb-6">
                  {rating >= 4 
                    ? `Thank you for your ${rating}-star rating! Please share a few words about your experience.`
                    : "We're sorry your experience wasn't 5-stars. Please let us know how we can make it right."}
                </p>
                
                <form onSubmit={handleSubmitInternal} className="space-y-4 text-left">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Your Name</label>
                    <input
                      required
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Email Address</label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Your Feedback / Review</label>
                    <textarea
                      required
                      rows={4}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={rating >= 4 ? "Great service, loved working with the team..." : "I was disappointed with..."}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#000080] text-white font-bold py-4 rounded-xl hover:bg-[#000066] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Submit Feedback
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  
                  <button 
                    type="button"
                    onClick={() => setStep('rating')}
                    className="w-full py-2 text-xs text-slate-400 font-semibold hover:text-slate-600 transition-colors"
                  >
                    Change Rating
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-[#000080]" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">Feedback Received</h2>
                <p className="text-slate-600 mb-8">
                  Thank you for your honesty, {name}. We've sent a confirmation email to {email}, and our management team will review your feedback immediately. We will be in touch shortly to make things right.
                </p>
                <div className="p-4 bg-slate-50 rounded-2xl text-xs text-slate-500 italic">
                  "Our goal is 100% satisfaction. Thank you for helping us improve."
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="bg-slate-50 py-4 px-8 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Feedback Flow</span>
          <div className="flex gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${step === 'rating' ? 'bg-[#000080]' : 'bg-slate-200'}`} />
            <div className={`w-1.5 h-1.5 rounded-full ${step === 'positive_thanks' || step === 'internal_feedback' ? 'bg-[#000080]' : 'bg-slate-200'}`} />
            <div className={`w-1.5 h-1.5 rounded-full ${step === 'success' ? 'bg-[#000080]' : 'bg-slate-200'}`} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaveFeedback;
