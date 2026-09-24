import { useState } from 'react';
import { BadgeDollarSign, Users } from 'lucide-react';
import TalentPartnerAdmin from './TalentPartnerAdmin';
import TalentPartnerPayoutVerification from './TalentPartnerPayoutVerification';

type View='program'|'payout-verification';

export default function TalentPartnerAdminHub(){
  const[view,setView]=useState<View>('program');
  return <div className="min-h-screen bg-[#f5f7fb]">
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-wrap gap-2">
        <button onClick={()=>setView('program')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${view==='program'?'bg-[#000080] text-white':'border border-slate-200 bg-white text-slate-600'}`}><Users className="h-4 w-4"/>Program & rewards</button>
        <button onClick={()=>setView('payout-verification')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${view==='payout-verification'?'bg-[#000080] text-white':'border border-slate-200 bg-white text-slate-600'}`}><BadgeDollarSign className="h-4 w-4"/>Payout verification</button>
      </div>
    </div>
    {view==='program'?<TalentPartnerAdmin/>:<TalentPartnerPayoutVerification/>}
  </div>;
}
