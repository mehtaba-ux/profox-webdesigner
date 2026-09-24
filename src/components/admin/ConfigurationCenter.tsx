import React from 'react';
import { ShieldCheck } from 'lucide-react';
import LegacyConfigurationCenter from './ConfigurationCenterLegacy';
import ProfessionalIntegrationsAdmin from './ProfessionalIntegrationsAdmin';
import WhatsAppBusinessAdmin from './WhatsAppBusinessAdmin';
import ContactLeadFormAdmin from './ContactLeadFormAdmin';
import RevenueDistributionAdmin from './RevenueDistributionAdmin';

/**
 * Compatibility wrapper around non-commercial configuration tools.
 * Sales Catalog remains the only source for package/product pricing. Revenue
 * distribution is a separate global finance policy that reads those prices live.
 */
export default function ConfigurationCenter() {
  return (
    <div className="canonical-configuration-center space-y-4">
      <style>{`
        .canonical-configuration-center .legacy-configuration-center > div > .grid.grid-cols-2 > button:nth-child(2) {
          display: none !important;
        }
      `}</style>
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" />
          <div>
            <h3 className="text-sm font-black text-slate-900">Sales Catalog remains the commercial price source</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              Package and Care Plan prices, inclusions, payment schedules, public visibility, ordering and Pricing-page facts are still managed only in Sales Catalog. The Revenue Distribution policy below reads those prices live and controls how future project economics are budgeted without duplicating package prices.
            </p>
            <button
              type="button"
              onClick={() => window.location.assign('/admin/app/sales?tab=sales_catalog')}
              className="mt-3 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"
            >
              Open Sales Catalog
            </button>
          </div>
        </div>
      </div>
      <RevenueDistributionAdmin />
      <ContactLeadFormAdmin />
      <ProfessionalIntegrationsAdmin />
      <WhatsAppBusinessAdmin />
      <div className="legacy-configuration-center">
        <LegacyConfigurationCenter />
      </div>
    </div>
  );
}
