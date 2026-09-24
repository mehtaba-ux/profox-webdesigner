import React from 'react';
import PaymentProcessTraining from './PaymentProcessTraining';

interface PaymentProcessViewProps {
  onComplete?: () => void;
}

export default function PaymentProcessView({ onComplete }: PaymentProcessViewProps) {
  return <PaymentProcessTraining onComplete={onComplete} />;
}
