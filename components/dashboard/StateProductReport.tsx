'use client';
import { useState } from 'react';

type Job={storeId:string;id:string;status:string;storeName?:string;errorCode?:string};
type Format='matrix'|'breakdown';
type Metric='orders'|'units'|'revenue';
export default function StateProductReport(){
  const [storeId,setStoreId]=useState('all');
  const [startDate,setStartDate]=useState('');
  const [endDate,setEndDate]=useState('');
  const [format,setFormat]=useState<Format>('matrix');
  const [metric,setMetric]=useState<Metric>('orders');
  const [jobs,setJobs]=useState<Job[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const ready=jobs.length>0 && jobs.every(j=>j.status==='COMPLETED');
  async function start(){
    setBusy(true);setError('');setJobs([]);
    try{
      const r=await fetch('/api/reports/states/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId,startDate,endDate})});
      const data=await r.json();
      if(!r.ok) throw new Error([data.error,...(data.errors??[])].join(' '));
      setJobs(data.jobs);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function check(){
    setBusy(true);setError('');
    try{
      const ids=jobs.map(({storeId,id})=>({storeId,id}));
      const r=await fetch('/api/reports/states/status?jobs='+encodeURIComponent(JSON.stringify(ids)),{cache:'no-store'});
      const data=await r.json();
      if(!r.ok) throw new Error(data.error ?? 'Unable to check report');
      setJobs(data.jobs);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function download(){
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/reports/states/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs,format,metric})});
      if(!r.ok){const body=await r.json();throw new Error(body.error ?? 'Export failed');}
      const blob=await r.blob(); const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=`state-products-${format}-${metric}.csv`;anchor.click();
      URL.revokeObjectURL(url);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <section className="rounded-xl border border-slate-200 p-5 space-y-4 bg-white text-slate-900">
    <div><h2 className="text-xl font-bold">State-wise Product Report</h2><p className="text-sm text-slate-500">Shopify bulk export for the full accessible order history (not capped at 10,000).</p></div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="text-sm">Store<select className="w-full border rounded p-2" value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="all">All configured stores</option></select></label>
      <label className="text-sm">Start date<input className="w-full border rounded p-2" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
      <label className="text-sm">End date<input className="w-full border rounded p-2" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
      <label className="text-sm">Report format<select className="w-full border rounded p-2" value={format} onChange={e=>setFormat(e.target.value as Format)}><option value="matrix">State-wise product matrix (default)</option><option value="breakdown">Product-wise state breakdown</option></select></label>
      <label className="text-sm">Metric<select className="w-full border rounded p-2" value={metric} onChange={e=>setMetric(e.target.value as Metric)}><option value="orders">Orders</option><option value="units">Units</option><option value="revenue">Revenue</option></select></label>
    </div>
    <div className="flex gap-2 flex-wrap"><button disabled={busy} onClick={start} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">Start bulk report</button><button disabled={busy||!jobs.length} onClick={check} className="rounded border px-4 py-2 disabled:opacity-50">Check status</button><button disabled={busy||!ready} onClick={download} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">Download CSV</button></div>
    {jobs.length>0 && <p className="text-sm">{jobs.map(j=>`${j.storeName??j.storeId}: ${j.status}${j.errorCode?' ('+j.errorCode+')':''}`).join(' · ')}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-xs text-slate-500">Orders = unique orders per product in a state. Multiple products in one order count separately. Unknown shipping states are labeled Unknown. Revenue uses Shopify shopMoney; ensure stores have compatible currencies before combining.</p>
  </section>;
}
