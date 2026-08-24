import React from 'react';
import QuotationProcessTraining from './QuotationProcessTraining';

interface QuotationProcessViewProps {
  onComplete?: () => void;
}

export default function QuotationProcessView({ onComplete }: QuotationProcessViewProps) {
  return <QuotationProcessTraining onComplete={onComplete} />;
}
