import React from 'react';
import CrmTraining from './CrmTraining';

interface CrmPracticalTestWidgetProps {
  onSubmit?: (data: any) => void;
  isSubmitting?: boolean;
}

/**
 * Compatibility entry point retained for MyTraining.
 * Module 17 is now server-scored by CrmTraining and no longer uses the legacy
 * six-checkbox Admin-review submission flow.
 */
export default function CrmPracticalTestWidget(_props: CrmPracticalTestWidgetProps) {
  return <CrmTraining />;
}
