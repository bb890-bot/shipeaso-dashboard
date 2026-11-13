import React from "react";
import Link from "next/link";
import { Store, CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { ShopifyStoreSummary } from "@/types/shopify";

interface HeaderProps {
  isConfigured: boolean;
  storeDomain?: string;
  stores: ShopifyStoreSummary[];
  selectedStoreId: string;
  onStoreChange: (storeId: string) => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConfigured,
  storeDomain,
  stores,
  selectedStoreId,
  onStoreChange,
  onOpenSettings,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-11 w-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm ring-1 ring-emerald-500/20">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Shopify Order Analytics
                </h1>
              </div>
              <p className="text-sm text-slate-500 font-medium">
                State-wise product order analysis & distribution
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/reports" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Export state × product CSV</Link>
            {stores.length > 0 && (
              <label className="relative">
                <span className="sr-only">Select Shopify store</span>
                <select
                  value={selectedStoreId}
                  onChange={(event) => onStoreChange(event.target.value)}
                  className="max-w-[190px] cursor-pointer rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {stores.length > 1 && <option value="all">All Stores (Combined)</option>}
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isConfigured ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Connected to Shopify</span>
                {storeDomain && (
                  <span className="hidden md:inline text-emerald-600/80 font-normal">
                    ({storeDomain})
                  </span>
                )}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                <span>Demo Mode (Credentials Not Set)</span>
              </div>
            )}

            <button
              onClick={onOpenSettings}
              className="p-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
              title="Connection Settings"
            >
              <Settings className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
