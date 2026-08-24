import React from 'react';
import { ShieldCheck } from 'lucide-react';
import LegacyConfigurationCenter from './ConfigurationCenterLegacy';

/**
 * Compatibility wrapper around non-commercial configuration tools.
 * The former Sales & Pricing category is intentionally inaccessible because Sales
 * Catalog is the only current commercial source of truth.
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
            <h3 className="text-sm font-black text-slate-900">Commercial settings live only in Sales Catalog</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              Package and Care Plan prices, inclusions, payment schedules, public visibility, ordering and Pricing-page package details are managed only in Sales Catalog. Other operational configuration remains available below.
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
      <div className="legacy-configuration-center">
        <LegacyConfigurationCenter />
      </div>
    </div>
  );
}
