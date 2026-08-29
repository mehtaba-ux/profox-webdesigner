import React from 'react';
import PublicBookingFlow from '../components/PublicBookingFlow';

export default function PublicBookingPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_35%,#f8fafc_100%)] px-5 py-10 text-slate-900 sm:px-8 sm:py-14 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <PublicBookingFlow />
      </div>
    </div>
  );
}
