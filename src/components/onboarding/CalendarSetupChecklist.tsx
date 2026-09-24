import React from 'react';
import CalendarMeetingTraining from './CalendarMeetingTraining';

interface CalendarSetupChecklistProps {
  onSave: (items: Record<string, boolean>) => Promise<void> | void;
  savedState?: Record<string, boolean>;
  completed?: boolean;
}

const LEGACY_COMPLETION_ITEMS: Record<string, boolean> = {
  c1:true,c2:true,c3:true,c4:true,c5:true,c6:true,c7:true,c8:true,c9:true
};

export default function CalendarSetupChecklist({ onSave, completed = false }: CalendarSetupChecklistProps) {
  return (
    <CalendarMeetingTraining
      onCertified={completed ? undefined : async () => {
        await onSave(LEGACY_COMPLETION_ITEMS);
      }}
    />
  );
}
