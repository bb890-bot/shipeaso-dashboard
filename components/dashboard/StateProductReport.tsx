"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
type Job={storeId:string;id:string;status:string;storeName?:string;errorCode?:string|null};
type Store={id:string;name:string;isConfigured?:boolean};
export default function StateProductReport(){
 const [stores,setStores]=useState<Store[]>([]),[storeId,setStoreId]=useState("all"),[startDate,setStartDate]=useState(""),[endDate,setEndDate]=useState("");
 const [format,setFormat]=useState<"matrix"|"breakdown">("matrix"),[metric,setMetric]=useState<"orders"|"units"|"revenue">("orders");
 const [jobs,setJobs]=useState<Job[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{fetch("/api/config").then(r=>r.json()).then(d=>setStores(d.stores??[])).catch(()=>{});},[]);
 const ready=jobs.length>0&&jobs.every(j=>j.status==="COMPLETED");
 async function action(mode:"start"|"status"|"export"){
 setBusy(true);setError("");
 try{
 const selected=jobs.map(({storeId,id})=>({storeId,id}));
 const url=mode==="status"?"/api/reports/states/status?jobs="+encodeURIComponent(JSON.stringify(selected)):"/api/reports/states/"+mode;
 const response=await fetch(url,mode==="status"?{cache:"no-store"}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(mode==="start"?{storeId,startDate,endDate}:{jobs:selected,format,metric})});
 if(!response.ok){const data=await response.json();throw new Error(data.error??"Shopify report request failed");}
 if(mode==="export"){const blob=await response.blob();const href=URL.createObjectURL(blob);const a=document.createElement("a");a.href=href;a.download="state-products-"+format+"-"+metric+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
 else{const data=await response.json();setJobs(data.jobs??[]);}
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 return <main className="min-h-screen bg-slate-50 px-4 py-8"><section className="mx-auto max-w-5xl rounded-xl bg-white border border-slate-200 p-6 space-y-5">
 <nav><Link href="/" className="text-emerald-700 font-medium">← Back to dashboard</Link></nav>
 <div><h1 className="text-2xl font-bold text-slate-900">State-wise Product Report</h1><p className="text-sm text-slate-500">Download all accessible Shopify orders by Indian state and product. Bulk export is not restricted to 10,000 orders.</p></div>
 <div className="grid gap-4 sm:grid-cols-3">
 <label className="text-sm font-medium">Store<select className="mt-1 w-full rounded border p-2" value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="all">All stores</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label className="text-sm font-medium">From<input className="mt-1 w-full rounded border p-2" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
 <label className="text-sm font-medium">To<input className="mt-1 w-full rounded border p-2" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
 <label className="text-sm font-medium">Format<select className="mt-1 w-full rounded border p-2" value={format} onChange={e=>setFormat(e.target.value as "matrix"|"breakdown")}><option value="matrix">State-wise product matrix (default)</option><option value="breakdown">Product-wise state breakdown</option></select></label>
 <label className="text-sm font-medium">Matrix metric<select className="mt-1 w-full rounded border p-2" value={metric} onChange={e=>setMetric(e.target.value as "orders"|"units"|"revenue")}><option value="orders">Orders</option><option value="units">Units</option><option value="revenue">Revenue</option></select></label>
 </div>
 <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>action("start")} className="px-4 py-2 bg-emerald-700 text-white rounded disabled:opacity-50">Start report</button><button disabled={busy||!jobs.length} onClick={()=>action("status")} className="px-4 py-2 border rounded disabled:opacity-50">Check status</button><button disabled={busy||!ready} onClick={()=>action("export")} className="px-4 py-2 bg-slate-800 text-white rounded disabled:opacity-50">Download CSV</button></div>
 {jobs.length>0&&<p className="text-sm text-slate-600">Status: {jobs.map(j=>(stores.find(s=>s.id===j.storeId)?.name??j.storeId)+": "+j.status+(j.errorCode?" ("+j.errorCode+")":"")).join(" · ")}</p>}
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 <p className="text-xs text-slate-500">Matrix totals count product-order combinations (one checkout with two products contributes two). Breakdown includes orders, units and revenue. Combined-store revenue is meaningful only when stores share a currency. The existing dashboard analytics still have their separate 10,000-order limit.</p>
 </section></main>;
}