import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { PortfolioItem } from '../../types';
import ImageUploader from './ImageUploader';
import { Check, ArrowRight, AlertCircle, Code2, Briefcase } from 'lucide-react';
import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import PortfolioManager from './PortfolioManager';

export default function DevOnboarding({ 
  portfolioItems = [], 
  existingProfile,
  onSavePortfolio,
  onSaveProfile
}: { 
  portfolioItems: PortfolioItem[];
  existingProfile?: any;
  onSavePortfolio: (item: PortfolioItem) => Promise<void>;
  onSaveProfile: (profile: any) => Promise<void>;
}) {
  const { user, role, completeOnboarding } = useAuth();
  const needsPortfolios = role === 'developer_designer';
  const hasProfile = !!(existingProfile && existingProfile.fullName);
  
  const [step, setStep] = useState(hasProfile && needsPortfolios ? 2 : 1);
  const [isGrouping, setIsGrouping] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [profile, setProfile] = useState({
    fullName: existingProfile?.fullName || '',
    title: existingProfile?.title || '',
    bio: existingProfile?.bio || '',
    avatar: existingProfile?.avatar || ''
  });

  // Sync state if profile loads asynchronously after mount
  useEffect(() => {
    if (existingProfile && existingProfile.fullName) {
      setProfile(prev => ({
        fullName: prev.fullName || existingProfile.fullName || '',
        title: prev.title || existingProfile.title || '',
        bio: prev.bio || existingProfile.bio || '',
        avatar: prev.avatar || existingProfile.avatar || ''
      }));
      if (needsPortfolios) {
        setStep(2);
      }
    }
  }, [existingProfile, needsPortfolios]);

  const safePortfolioItems = Array.isArray(portfolioItems) ? portfolioItems : [];
  const myPortfolios = safePortfolioItems.filter(p => p && p.authorId === user?.id);
  const portfoliosAdded = myPortfolios.length;
  const isProfileComplete = profile.fullName && profile.title && profile.bio && profile.avatar;

  const handleNextStep = () => {
    if (step === 1 && isProfileComplete) {
      if (needsPortfolios) {
        // Show loading transition like Screenshot 3
        setIsGrouping(true);
        setTimeout(() => {
          setIsGrouping(false);
          setStep(2);
        }, 1500);
      } else {
        handleComplete();
      }
    }
  };

  const handleComplete = async () => {
    if ((needsPortfolios ? portfoliosAdded>= 4 : true) && user?.id) {
      setIsGrouping(true);
      await onSaveProfile({
        id: existingProfile?.id || crypto.randomUUID(),
        userId: user.id,
        role: role || 'developer_designer',
        fullName: profile.fullName,
        title: profile.title,
        bio: profile.bio,
        avatar: profile.avatar,
        createdAt: new Date().toISOString()
      });
      
      setIsGrouping(false);
      setIsSuccess(true);
      
      // Delay to show success screen (Screenshot 4)
      setTimeout(() => {
        completeOnboarding();
      }, 2000);
    }
  };

  const handleSaveWrapper = async (item: PortfolioItem) => {
    const itemToSave = {
      ...item,
      status: 'pending' as const,
      authorId: user?.id
    };
    await onSavePortfolio(itemToSave);
  };

  // Loading Screen (matches Screenshot 3)
  if (isGrouping) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Please wait we are saving your entries ...</h2>
        <p className="text-slate-500 mb-8">We are collecting your inputs to prepare your workspace</p>
        <div className="w-96 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 w-1/2 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }

  // Success Screen (matches Screenshot 4)
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans">
        <h2 className="text-4xl font-bold text-slate-900 mb-2">Congratulation! We are ready for next step</h2>
        <p className="text-slate-500 mb-16 text-lg">Your account has been successfully set up.</p>
        <div className="w-32 h-32 rounded-full border-4 border-emerald-500 flex items-center justify-center mb-16">
          <Check className="w-16 h-16 text-emerald-500" strokeWidth={1.5} />
        </div>
        <button 
          type="button"
          onClick={completeOnboarding}
          className="bg-[#000080] hover:bg-[#000066] text-white px-8 py-3 rounded text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
        >
          Proceed to Dashboard <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col lg:flex-row">
      {/* Top Left Logo Area */}
      <div className="absolute top-8 left-8 flex items-center gap-2 z-10 hidden lg:flex">
        <div className="w-8 h-8 rounded-lg bg-[#000080] flex items-center justify-center text-white">
          <Code2 className="w-4 h-4" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col px-8 lg:px-32 pt-24 pb-24 overflow-y-auto">
        
        {step === 1 && (
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-[44px] font-bold text-slate-900 leading-tight mb-2 tracking-tight">
              Profile Setup
            </h1>
            <p className="text-xl text-slate-500 mb-16 font-light">
              Add your professional details to set up your account.
            </p>

            <div className="space-y-12">
              {/* Avatar */}
              <div>
                <h3 className="text-xl text-slate-900 mb-2">Add Profile Picture</h3>
                <p className="text-sm text-slate-500 mb-4">Upload a professional headshot for your team profile.</p>
                <div className="max-w-md">
                  <ImageUploader 
                    value={profile.avatar}
                    onChange={(url) => setProfile({ ...profile, avatar: url })}
                  />
                </div>
              </div>

              {/* Full Name */}
              <div>
                <h3 className="text-xl text-slate-900 mb-2">Full Name</h3>
                <p className="text-sm text-slate-500 mb-4">Enter your legal or preferred professional name.</p>
                <input 
                  type="text" 
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-slate-50 border-0 rounded-sm px-6 py-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#000080] transition-all outline-none"
                  placeholder="Start typing the name ..."
                />
              </div>

              {/* Title */}
              <div>
                <h3 className="text-xl text-slate-900 mb-2">Professional Title</h3>
                <p className="text-sm text-slate-500 mb-4">Your role at Profox Web Designer.</p>
                <input 
                  type="text" 
                  value={profile.title}
                  onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                  className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-slate-50 border-0 rounded-sm px-6 py-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#000080] transition-all outline-none"
                  placeholder="Start typing the title ..."
                />
              </div>

              {/* Bio */}
              <div>
                <h3 className="text-xl text-slate-900 mb-2">Bio / Statement</h3>
                <p className="text-sm text-slate-500 mb-4">Tell us about your background and expertise.</p>
                <textarea 
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={4}
                  className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-slate-50 border-0 rounded-sm px-6 py-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#000080] transition-all resize-none outline-none"
                  placeholder="Start typing your bio ..."
                />
              </div>

              <div className="pt-8">
                <button 
                  type="button"
                  onClick={handleNextStep}
                  disabled={!isProfileComplete}
                  className={`px-8 py-3.5 rounded text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                    isProfileComplete 
                      ? 'bg-[#000080] hover:bg-[#000066] text-white cursor-pointer' 
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Save & go next
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-[44px] font-bold text-slate-900 leading-tight mb-2 tracking-tight">
              Portfolio Setup
            </h1>
            <p className="text-xl text-slate-500 mb-12 font-light">
              Add your best case studies to complete onboarding.
            </p>

            <div className="flex items-center gap-6 mb-12 bg-slate-50 p-6 rounded-lg">
              <div className="w-16 h-16 rounded-full border-4 border-slate-200 flex items-center justify-center relative overflow-hidden shrink-0">
                <div 
                  className="absolute bottom-0 left-0 right-0 bg-[#000080] transition-all duration-500"
                  style={{ height: `${Math.min(100, (portfoliosAdded / 4) * 100)}%` }}
                />
                <Briefcase className={`w-6 h-6 z-10 ${portfoliosAdded> 0 ? 'text-white' : 'text-slate-400'}`} />
              </div>
              <div>
                <h4 className="text-xl font-bold text-slate-900 mb-1">{portfoliosAdded} of 4 Required</h4>
                <p className="text-slate-500 text-sm">Please add at least 4 portfolio items to activate your account.</p>
              </div>
            </div>

            {portfoliosAdded < 4 && (
              <div className="mb-8 flex items-start gap-3 text-[#000080] bg-blue-50/50 p-4 rounded-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  These items will be saved as "Pending" and will require admin approval before going live.
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <PortfolioManager 
                items={myPortfolios}
                onSave={handleSaveWrapper}
                onDelete={async () => {}} 
              />
            </div>

            <div className="mt-12 flex justify-end">
              <button 
                type="button"
                onClick={handleComplete}
                disabled={portfoliosAdded < 4}
                className={`px-8 py-3.5 rounded text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                  portfoliosAdded >= 4
                    ? 'bg-[#000080] hover:bg-[#000066] text-white cursor-pointer' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}>
                Complete Setup <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar (Navigation) */}
      <div className="w-full lg:w-[400px] bg-[#000080] text-white p-12 lg:p-16 flex flex-col shrink-0">
        <h2 className="text-2xl font-bold mb-12">Quick & Easy Setup</h2>
        
        <div className="relative pl-[11px] border-l border-white/20 space-y-12 py-2">
          {/* Step 1 Item */}
          <div className="relative flex items-center gap-4">
            <div className={`absolute -left-[16px] w-2.5 h-2.5 rounded-full ${step>= 1 ? 'bg-white' : 'bg-[#000080] border-2 border-white/50'}`} />
            <span className={`font-medium ${step>= 1 ? 'text-white' : 'text-white/60'}`}>Profile setup</span>
            {step === 1 && (
              <span className="bg-white text-[#000080] text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">
                1 out of {needsPortfolios ? '2' : '1'}
              </span>
            )}
          </div>
          
          {/* Step 2 Item (Only if needed) */}
          {needsPortfolios && (
            <div className="relative flex items-center gap-4">
              <div className={`absolute -left-[16px] w-2.5 h-2.5 rounded-full ${step>= 2 ? 'bg-white' : 'bg-[#000080] border-2 border-white/50'}`} />
              <span className={`font-medium ${step>= 2 ? 'text-white' : 'text-white/60'}`}>Portfolio setup</span>
              {step === 2 && (
                <span className="bg-white text-[#000080] text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">
                  2 out of 2
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
