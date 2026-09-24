import React from 'react';
import { Focus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import ProductivityCommandCenter from './ProductivityCommandCenter';
import SellerExperienceClosure from './SellerExperienceClosure';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

export default function TodayCommandCenter() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }

  if (profile && profile.status === 'active' && SELLER_ROLES.includes(profile.role)) {
    return <div className="bg-[#f3f7fc]">
      <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-xs font-black text-[#000080]">Today is your overview. Activities & Follow-Up is where you execute.</div><div className="mt-0.5 text-[11px] text-slate-500">Open the prioritized queue and work through the highest-impact action first.</div></div>
          <button onClick={() => navigate('/admin/app/crm?tab=activities')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><Focus className="h-4 w-4" />Start Work / Focus Session</button>
        </div>
      </div>
      <SellerExperienceClosure />
    </div>;
  }

  return <ProductivityCommandCenter />;
}
