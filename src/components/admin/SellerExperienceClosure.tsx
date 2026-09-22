import SellerExperienceLegacy from './SellerExperienceLegacy';
import SellerLifecyclePanel from './SellerLifecyclePanel';
import SalesCertificationPermissionsPanel from './SalesCertificationPermissionsPanel';

export default function SellerExperienceClosure() {
  return (
    <>
      <SellerLifecyclePanel />
      <SalesCertificationPermissionsPanel />
      <section className="bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <details className="rounded-2xl border border-slate-200 bg-slate-50/70">
            <summary className="cursor-pointer px-5 py-4 text-xs font-black text-slate-700">
              Seller tools, performance & history
              <span className="ml-2 font-medium text-slate-400">Open when you need meetings, follow-ups, targets, commissions or historical tools.</span>
            </summary>
            <div className="border-t border-slate-200 bg-white">
              <SellerExperienceLegacy />
            </div>
          </details>
        </div>
      </section>
    </>
  );
}
