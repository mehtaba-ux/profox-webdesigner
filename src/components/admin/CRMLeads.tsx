import React from 'react';
import CRMLeadWorkspace from './crm/CRMLeadWorkspace';
import CRMLeadAssignmentQueue from './crm/CRMLeadAssignmentQueue';
import CRMLeadFastResponseQueue from './crm/CRMLeadFastResponseQueue';

export default function CRMLeads(props: { onNavigate?: (tab: string) => void }) {
  return (
    <div className="space-y-6">
      <CRMLeadAssignmentQueue />
      <CRMLeadFastResponseQueue />
      <CRMLeadWorkspace {...props} />
    </div>
  );
}
