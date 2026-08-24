import React from 'react';
import ConfidentialityDataTraining from './ConfidentialityDataTraining';

interface ConfidentialityAckWidgetProps {
  onAcknowledge: (data: { agreed: boolean; date: string }) => Promise<void>;
  isSubmitting?: boolean;
  status?: string;
}

export default function ConfidentialityAckWidget({ onAcknowledge }: ConfidentialityAckWidgetProps) {
  return <ConfidentialityDataTraining onCertified={() => onAcknowledge({ agreed: true, date: new Date().toISOString() })} />;
}
