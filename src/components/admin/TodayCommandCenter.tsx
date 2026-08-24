import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import ProductivityCommandCenter from './ProductivityCommandCenter';
import SellerExperienceClosure from './SellerExperienceClosure';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

export default function TodayCommandCenter() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }

  if (profile && profile.status === 'active' && SELLER_ROLES.includes(profile.role)) {
    return <SellerExperienceClosure />;
  }

  return <ProductivityCommandCenter />;
}
