import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Upload,
  X,
  Copy,
  Check,
  ShieldCheck,
  Building,
  Globe,
  Mail,
  User,
  HeartHandshake,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCMS } from '../lib/CMSProvider';
import { submitPublicFeedback } from '../lib/supabase';

const RATING_LABELS: Record<number, { label: string; desc: string; color: string }> = {
  1: { label: 'Needs Improvement', desc: 'We fell short of your expectations. Please tell us how we can make it right.', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  2: { label: 'Fair / Below Expectations', desc: 'There were issues with the process or results. We appreciate your constructive input.', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  3: { label: 'Satisfactory / Average', desc: 'The project was delivered, but there is room for improvement.', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  4: { label: 'Very Good Experience', desc: 'You had a great experience and we delivered solid results.', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  5: { label: 'Exceptional & 5-Stars', desc: 'Outstanding collaboration, high quality, and exceed expectations!', color: 'text-[#000080] bg-indigo-50 border-indigo-200' }
};

const SUGGESTED_TAGS = [
  'Website Design',
  'Web & Mobile App',
  'Email & Automation',
  'Technical Speed',
  'Communication',
  'Creative Quality'
];

const PUBLIC_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PUBLIC_PHOTO_BYTES = 320 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The photo could not be prepared.'));
    reader.readAsDataURL(blob);
  });
}

async function preparePublicFeedbackPhoto(file: File) {
  if (!PUBLIC_PHOTO_TYPES.has(file.type)) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image size exceeds 5 MB. Please choose a smaller photo.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const photo = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The selected photo could not be decoded.'));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 512 / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo preparation is not supported by this browser.');
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);

    let prepared = await canvasToBlob(canvas, 0.76);
    if (prepared && prepared.size > MAX_PUBLIC_PHOTO_BYTES) prepared = await canvasToBlob(canvas, 0.58);
    if (!prepared || prepared.size > MAX_PUBLIC_PHOTO_BYTES) {
      throw new Error('The photo is still too large after optimization. Please choose a simpler or smaller image.');
    }
    return blobToDataUrl(prepared);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function LeaveFeedback() {
  const { content } = useCMS();
  
  // Step state: 1 (Rating & Review) -> 2 (Client Profile) -> 3 (Complete)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  
  // Form fields
  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState('');
  const [imageFileName, setImageFileName] = useState('');
  
  // UI states
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedReview, setCopiedReview] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const siteSettings = content.siteSettings || {};
  const businessName = siteSettings.businessName || 'Profox web designer';
  const googleReviewUrl = siteSettings.googleReviewUrl || 'https://google.com/search?q=profox+web+designer+reviews';

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Prepare a small moderated testimonial photo without exposing the staff media library.
  const handleLocalFileSelect = async (file?: File) => {
    if (!file) return;

    setUploadError('');
    setIsUploadingPhoto(true);
    setImageFileName(file.name);

    try {
      setImage(await preparePublicFeedbackPhoto(file));
    } catch (err: any) {
      setImage('');
      setImageFileName('');
      setUploadError(err?.message || 'The photo could not be prepared.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLocalFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleLocalFileSelect(file);
    }
  };

  const removePhoto = () => {
    setImage('');
    setImageFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProceedToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0 || !comment.trim()) return;
    setCurrentStep(2);
    window.scrollTo({ top: 80, behavior: 'smooth' });
  };

  const handleSubmitFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !comment.trim() || rating === 0) return;
    setIsSubmitting(true);

    try {
      const fullComment = selectedTags.length > 0
        ? `${comment.trim()}\n\n[Services / Highlights: ${selectedTags.join(', ')}]`
        : comment.trim();

      const newFeedback = {
        customerName: name.trim(),
        customerEmail: email.trim(),
        position: position.trim() || undefined,
        link: link.trim() || undefined,
        image: image || undefined,
        rating: rating,
        comment: fullComment,
      };

      const { error } = await submitPublicFeedback(newFeedback);
      if (error) throw error;

      setCurrentStep(3);
      window.scrollTo({ top: 80, behavior: 'smooth' });
    } catch (err) {
      console.error('Error submitting feedback:', err);
      alert('There was an error saving your review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyReviewAndOpenGoogle = () => {
    navigator.clipboard.writeText(comment);
    setCopiedReview(true);
    setTimeout(() => setCopiedReview(false), 3000);
    window.open(googleReviewUrl, '_blank', 'noopener,noreferrer');
  };

  const activeRatingInfo = RATING_LABELS[hoveredRating || rating] || RATING_LABELS[5];

  return (
    <div className="min-h-screen bg-slate-50/60 pt-28 pb-16 px-4 sm:px-6 flex flex-col justify-center items-center">
      {/* Max width container designed to fit cleanly inside standard viewport without overflow */}
      <div className="w-full max-w-xl mx-auto">
        
        {/* Main Card Container */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
          
          {/* Header & Step Indicator */}
          <div className="bg-gradient-to-r from-slate-900 via-[#000080] to-slate-900 text-white p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="relative z-10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-200 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
                  <MessageSquare className="w-3 h-3 text-yellow-300" />
                  Client Review
                </span>
                
                {currentStep < 3 && (
                  <span className="text-xs font-semibold text-indigo-100 bg-black/20 px-3 py-1 rounded-full border border-white/10">
                    Step {currentStep} of 2
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {currentStep === 1 && 'How was your experience?'}
                {currentStep === 2 && 'About You & Your Project'}
                {currentStep === 3 && (rating >= 4 ? 'Thank you for your review!' : 'Thank you for your feedback')}
              </h1>
              
              <p className="text-xs sm:text-sm text-indigo-100/80 leading-relaxed max-w-md">
                {currentStep === 1 && `Your feedback helps us continuously improve our digital design and development services.`}
                {currentStep === 2 && `Share your name and optional photo so we can verify and attribute your feedback.`}
                {currentStep === 3 && (rating >= 4 
                  ? `Your 5-star review means the world to our team.` 
                  : `We appreciate your transparency and will reach out to resolve any challenges.`)}
              </p>

              {/* Progress Steps Bar */}
              {currentStep < 3 && (
                <div className="pt-2 flex items-center gap-2">
                  <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${currentStep >= 1 ? 'bg-yellow-400' : 'bg-white/20'}`} />
                  <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${currentStep >= 2 ? 'bg-yellow-400' : 'bg-white/20'}`} />
                </div>
              )}
            </div>
          </div>

          {/* Form Content Body */}
          <div className="p-6 sm:p-8">
            <AnimatePresence mode="wait">
              
              {/* ================= STEP 1: RATING & REVIEW ================= */}
              {currentStep === 1 && (
                <motion.form
                  key="step1"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onSubmit={handleProceedToStep2}
                  className="space-y-6"
                >
                  {/* Interactive Star Rating */}
                  <div className="space-y-3 text-center sm:text-left">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Overall Rating <span className="text-red-500">*</span>
                    </label>
                    
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                      <div className="flex items-center gap-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-2xl">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const isActive = (hoveredRating || rating) >= star;
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              onMouseEnter={() => setHoveredRating(star)}
                              onMouseLeave={() => setHoveredRating(0)}
                              className="p-1.5 sm:p-2 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95 focus:outline-none"
                              aria-label={`Rate ${star} star`}
                            >
                              <Star
                                className={`w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
                                  isActive
                                    ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                                    : 'text-slate-300 hover:text-amber-200'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>

                      {/* Live Rating Label Pill */}
                      <div className="flex-1 text-center sm:text-left">
                        <div className={`inline-block px-3 py-1 rounded-lg border text-xs font-bold ${activeRatingInfo.color}`}>
                          {activeRatingInfo.label}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                          {activeRatingInfo.desc}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Highlights / Service Tags */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      What did we work on together? <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_TAGS.map((tag) => {
                        const isSelected = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                              isSelected
                                ? 'bg-[#000080] text-white border-[#000080] shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detailed Review Text */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Your Feedback / Review <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {comment.length} characters
                      </span>
                    </div>

                    <textarea
                      required
                      rows={4}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={
                        rating >= 4
                          ? "What made working with our team special? How did our website or application impact your business?"
                          : "Please let us know what went wrong, what communication or delivery bottlenecks you experienced..."
                      }
                      className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all resize-none placeholder:text-slate-400"
                    />
                  </div>

                  {/* Step 1 Action Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!comment.trim() || rating === 0}
                      className="w-full bg-[#000080] hover:bg-[#000066] text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-md shadow-[#000080]/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                    >
                      Continue to Client Details
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ================= STEP 2: CLIENT PROFILE & PHOTO ================= */}
              {currentStep === 2 && (
                <motion.form
                  key="step2"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onSubmit={handleSubmitFinal}
                  className="space-y-5"
                >
                  {/* Back button link */}
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#000080] transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Edit Rating & Review
                  </button>

                  {/* Name & Email Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Your Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Alex Morgan"
                        className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex@company.com"
                        className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Position & Website Link Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        Position / Company <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        placeholder="e.g. Founder & CEO"
                        className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        Website Link <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="url"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://company.com"
                        className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* STRICT CLIENT-ONLY PHOTO UPLOAD (NO MEDIA LIBRARY / NO BACKEND ASSETS) */}
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Your Photo / Avatar <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>

                    {/* Hidden input for local device file picker */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileInputChange}
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                    />

                    {image ? (
                      /* Uploaded Avatar Preview State */
                      <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <img
                              src={image}
                              alt="Avatar Preview"
                              className="w-12 h-12 rounded-full object-cover border-2 border-[#000080]/20 shadow-sm"
                            />
                            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {imageFileName || 'Photo selected'}
                            </p>
                            <p className="text-[11px] text-emerald-600 font-medium">
                              Ready for your review card
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs font-bold text-[#000080] hover:bg-[#000080]/5 px-3 py-1.5 rounded-lg border border-[#000080]/20 transition-all"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={removePhoto}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Remove Photo"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Drag and Drop / Device Browse Box */
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
                          dragOver
                            ? 'border-[#000080] bg-indigo-50/50'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-[#000080]">
                            {isUploadingPhoto ? (
                              <div className="w-4 h-4 border-2 border-[#000080]/30 border-t-[#000080] rounded-full animate-spin" />
                            ) : (
                              <Upload className="w-5 h-5" />
                            )}
                          </div>
                          <div className="text-center sm:text-left">
                            <p className="text-xs font-bold text-slate-800">
                              Upload photo from your computer
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Drag and drop or browse (PNG, JPG, WEBP up to 5MB)
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {uploadError && (
                      <p className="text-[11px] text-red-600 font-medium">{uploadError}</p>
                    )}
                  </div>

                  {/* Submission and Privacy Assurance */}
                  <div className="pt-3 space-y-3">
                    <button
                      type="submit"
                      disabled={isSubmitting || !name.trim() || !email.trim()}
                      className="w-full bg-[#000080] hover:bg-[#000066] text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-md shadow-[#000080]/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Submitting Feedback...</span>
                        </>
                      ) : (
                        <>
                          <span>Submit Feedback</span>
                          <CheckCircle2 className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Your contact details are kept private and never shared publicly.</span>
                    </div>
                  </div>
                </motion.form>
              )}

              {/* ================= STEP 3: SUCCESS & GOOGLE REVIEW CALLOUT ================= */}
              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6 text-center py-2"
                >
                  {rating >= 4 ? (
                    /* 4-5 Stars Celebration Flow */
                    <div className="space-y-5">
                      <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-500 shadow-inner">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>

                      <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-slate-900">
                          Thank You, {name}!
                        </h2>
                        <p className="text-sm text-slate-600 max-w-sm mx-auto">
                          We are thrilled you had a positive experience. Would you mind copying your feedback and posting it to our Google Reviews page?
                        </p>
                      </div>

                      {/* Submitted Review Snippet Box */}
                      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-left space-y-2 relative">
                        <div className="flex items-center gap-1 text-amber-400">
                          {[...Array(rating)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-amber-400" />
                          ))}
                        </div>
                        <p className="text-xs text-slate-700 italic font-serif leading-relaxed line-clamp-3">
                          "{comment}"
                        </p>
                      </div>

                      {/* 1-Click Google Review Callout */}
                      <div className="space-y-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCopyReviewAndOpenGoogle}
                          className="w-full bg-[#000080] hover:bg-[#000066] text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-lg shadow-[#000080]/20 flex items-center justify-center gap-2 group cursor-pointer"
                        >
                          {copiedReview ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span>Review Copied! Opening Google...</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Copy Review & Share on Google</span>
                              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </>
                          )}
                        </button>
                        <p className="text-[11px] text-slate-400">
                          Copies your written review to your clipboard and opens our Google profile.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* 1-3 Stars Resolution Flow */
                    <div className="space-y-5">
                      <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center mx-auto text-[#000080]">
                        <HeartHandshake className="w-8 h-8" />
                      </div>

                      <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-slate-900">
                          We Hear You, {name}
                        </h2>
                        <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                          Your feedback has been forwarded directly to our senior leadership team at {businessName}. We will review your notes and contact you at <span className="font-semibold text-slate-800">{email}</span> to resolve your concerns.
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs text-slate-500 italic">
                        "Our priority is 100% satisfaction and genuine partnership with every client."
                      </div>
                    </div>
                  )}

                  {/* Return Home Link */}
                  <div className="pt-2 border-t border-slate-100">
                    <Link
                      to="/"
                      className="inline-flex items-center gap-2 text-xs font-bold text-[#000080] hover:underline"
                    >
                      Return to Homepage
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Security / Trust Note */}
          <div className="bg-slate-50/80 px-6 py-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">{businessName}</span>
            <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Verified Feedback</span>
          </div>

        </div>

      </div>
    </div>
  );
}
