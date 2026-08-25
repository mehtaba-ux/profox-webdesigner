import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { quotationApprovalService } from '../../../lib/quotationApprovalService';

export default function QuotationApprovalsNavButton({ active = false, onNavigate }: { active?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    quotationApprovalService.canAccess().then(value => { if (!cancelled) setVisible(value); }).catch(() => { if (!cancelled) setVisible(false); });
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;
  return <button type="button" onClick={() => { onNavigate?.(); navigate('/admin/quotation-approvals'); }} className={`pf-shell-nav-item ${active ? 'is-active' : ''}`} title="Quotation Approvals">
    <span className="pf-shell-nav-icon"><ShieldCheck className="h-[17px] w-[17px]" /></span>
    <span className="truncate">Approvals</span>
  </button>;
}
