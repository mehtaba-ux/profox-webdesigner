import React from 'react';
import CRMPipelineBase from './CRMPipelineBase';
import MonthlyWonSalesPanel from './MonthlyWonSalesPanel';

export default function CRMPipeline({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  return (
    <div className="space-y-8">
      <CRMPipelineBase onNavigate={onNavigate} />
      <MonthlyWonSalesPanel />
    </div>
  );
}
