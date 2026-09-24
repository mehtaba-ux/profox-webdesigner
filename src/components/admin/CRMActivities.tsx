import React from 'react';
import { useSearchParams } from 'react-router-dom';
import CRMActivitiesExecutionCenter from './CRMActivitiesExecutionCenter';
import CRMActivityExecutionSettingsAdmin from './CRMActivityExecutionSettingsAdmin';

export default function CRMActivities(props: { onNavigate?: (tab: string) => void }) {
  const [searchParams] = useSearchParams();
  if (searchParams.get('activitySettings') === '1') return <CRMActivityExecutionSettingsAdmin />;
  return <CRMActivitiesExecutionCenter {...props} />;
}
