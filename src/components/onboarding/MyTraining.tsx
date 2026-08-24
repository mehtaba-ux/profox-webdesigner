import React from 'react';
import { useAuth } from '../../lib/AuthContext';
import ContentWriterAcademy from './ContentWriterAcademy';
import SharedTraining from './SharedTraining';

// One Academy entry point. Content Writers reuse the existing PF-SOP-07 Academy UI;
// Sales, UI/UX and Development continue through the shared role-aware Academy.
export default function MyTraining() {
  const { role } = useAuth();
  return role === 'content_writer' ? <ContentWriterAcademy /> : <SharedTraining />;
}
