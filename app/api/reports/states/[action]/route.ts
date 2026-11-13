import { NextRequest, NextResponse } from 'next/server';
import { isShopifyConfigured, loadStores, shopifyFetch } from '@/lib/shopify-multi';
import { absorbJsonl, createReport, toCsv, type Metric, type Format } from '@/lib/state-report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control':'no-store' };
const START = `mutation Start($query:String!){ bulkOperationRunQuery(query:$query){ bulkOperation{ id status } userErrors{ field message } } }`;
const STATUS = `query Status($id:ID!){ bulkOperation(id:$id){ id status url errorCode objectCount rootObjectCount } }`;
type Operation = { id:string; status:string; url?:string|null; errorCode?:string|null; objectCount?:string; rootObjectCount?:string };
function respond(data:unknown,status=200){ return NextResponse.json(data,{status,headers}); }
function failure(e:unknown){ return respond({ error:e instanceof Error?e.message:'Unknown error' },500); }
function storeList(selected:string){
  const all=loadStores().filter(s=>isShopifyConfigured(s.id));
  return selected==='all' ? all : all.filter(s=>s.id===selected);
}
function dateRange(search:URLSearchParams):string {
  const start=search.get('startDate'); const end=search.get('endDate');
  for(const s of [start,end]) if(s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Date format must be YYYY-MM-DD');
  if(start && end && start>end) throw new Error('Start date must be before end date');
  const q:string[]=[];
  if(start) q.push(`created_at:>='${start}T00:00:00+05:30'`);
  if(end) q.push(`created_at:<='${end}T23:59:59+05:30'`);
  return q.join(' ');
}
function bulkQuery(filter:string):string {
  const escaped=JSON.stringify(filter);
  return `{
    orders(query:${escaped}, sortKey:CREATED_AT) {
      edges { node {
        id createdAt
        shippingAddress { countryCodeV2 province provinceCode }
        lineItems {
          edges { node {
            id title quantity sku
            product { id title }
            discountedTotalSet { shopMoney { amount currencyCode } }
          } }
        }
      } }
    }
  }`;
}
async function readOperation(storeId:string,id:string):Promise<Operation> {
  const data=await shopifyFetch<{bulkOperation:Operation|null}>({query:STATUS,variables:{id},storeId});
  if(!data?.bulkOperation) throw new Error(`Cannot find bulk operation for store ${storeId}`);
  return data.bulkOperation;
}
function validateUrl(raw:string):string {
  const url=new URL(raw);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:' || !(host==='storage.googleapis.com' || host.endsWith('.shopify.com') || host==='shopify.com' || host.endsWith('.googleapis.com')))
    throw new Error('Unexpected bulk download URL host');
  return url.toString();
}
function parseJobs(value:unknown):{storeId:string;id:string}[] {
  if(!Array.isArray(value) || value.length>10) throw new Error('Invalid jobs');
  return value.map((job)=>{
    if(!job || typeof job.storeId!=='string' || typeof job.id!=='string' || !/^gid:\/\/shopify\/BulkOperation\/\d+$/.test(job.id))
      throw new Error('Invalid bulk operation identifier');
    return {storeId:job.storeId,id:job.id};
  });
}
// POST /api/reports/states/start  {storeId, startDate, endDate}
// GET  /api/reports/states/status?jobs=<encoded JSON array>
// POST /api/reports/states/export {jobs, format, metric}
export async function POST(request:NextRequest,ctx:{params:Promise<{action:string}>}) {
  try {
    const {action}=await ctx.params;
    const body=await request.json();
    if(action==='start') {
      const selected=String(body.storeId ?? 'all');
      const stores=storeList(selected);
      if(!stores.length) return respond({error:'No configured Shopify stores for selection'},400);
      const params=new URLSearchParams();
      if(body.startDate) params.set('startDate',String(body.startDate));
      if(body.endDate) params.set('endDate',String(body.endDate));
      const query=bulkQuery(dateRange(params));
      const results=await Promise.allSettled(stores.map(async(store)=>{
        const data=await shopifyFetch<{bulkOperationRunQuery:{bulkOperation:Operation|null;userErrors:{message:string}[]}}>({
          query:START,variables:{query},storeId:store.id
        });
        const result=data.bulkOperationRunQuery;
        if(result.userErrors.length || !result.bulkOperation) throw new Error(result.userErrors.map(e=>e.message).join('; ') || 'Bulk operation start failed');
        return {storeId:store.id,storeName:store.name,id:result.bulkOperation.id,status:result.bulkOperation.status};
      }));
      const jobs=results.filter(r=>r.status==='fulfilled').map(r=>(r as PromiseFulfilledResult<{storeId:string;storeName:string;id:string;status:string}>).value);
      const errors=results.map((r,i)=>r.status==='rejected'?`${stores[i].id}: ${String(r.reason)}`:null).filter(Boolean);
      if(errors.length) return respond({error:'One or more stores failed to start. Re-run for the failed stores.',jobs,errors},502);
      return respond({jobs});
    }
    if(action==='export') {
      const jobs=parseJobs(body.jobs);
      if(!jobs.length) return respond({error:'No jobs selected'},400);
      const metric:Metric=body.metric;
      const format:Format=body.format;
      if(!['orders','units','revenue'].includes(metric) || !['matrix','breakdown'].includes(format)) return respond({error:'Invalid export options'},400);
      const configured=storeList('all');
      const report=createReport();
      for(const job of jobs) {
        const store=configured.find(s=>s.id===job.storeId);
        if(!store) return respond({error:'Store not configured'},400);
        const op=await readOperation(store.id,job.id);
        if(op.status!=='COMPLETED' || !op.url) return respond({error:`${store.name}: report is not complete (${op.status})`},409);
        await absorbJsonl(report,validateUrl(op.url),store.name,request.signal);
      }
      const csv=toCsv(report,format,metric);
      const filename=`state-products-${format}-${metric}-${new Date().toISOString().slice(0,10)}.csv`;
      return new Response(csv,{status:200,headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`}});
    }
    return respond({error:'Unknown action'},404);
  } catch(e) {return failure(e);}
}
export async function GET(request:NextRequest,ctx:{params:Promise<{action:string}>}) {
  try {
    const {action}=await ctx.params;
    if(action!=='status') return respond({error:'Unknown action'},404);
    const jobs=parseJobs(JSON.parse(request.nextUrl.searchParams.get('jobs') ?? '[]'));
    const stores=storeList('all');
    const operations=await Promise.all(jobs.map(async job=>{
      if(!stores.some(s=>s.id===job.storeId)) throw new Error('Store not configured');
      const op=await readOperation(job.storeId,job.id);
      return {storeId:job.storeId,id:job.id,status:op.status,errorCode:op.errorCode,objectCount:op.objectCount,rootObjectCount:op.rootObjectCount};
    }));
    return respond({jobs:operations});
  } catch(e) {return failure(e);}
}
