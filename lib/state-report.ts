/** Shopify bulk JSONL -> state by product aggregation. */
export type Metric = 'orders' | 'units' | 'revenue';
export type Format = 'matrix' | 'breakdown';
type Row = Record<string, unknown> & { id?: string; __parentId?: string };
type Aggregate = { orders: number; units: number; revenue: number };
export type Report = { rows: Map<string, Map<string, Aggregate>>; products: Set<string>; orderCount: number; missingState: number };
const STATE_CODES: Record<string, string> = {
  AN:'Andaman and Nicobar Islands', AP:'Andhra Pradesh', AR:'Arunachal Pradesh', AS:'Assam', BR:'Bihar', CH:'Chandigarh',
  CT:'Chhattisgarh', CG:'Chhattisgarh', DD:'Daman and Diu', DN:'Dadra and Nagar Haveli and Daman and Diu', DL:'Delhi', GA:'Goa',
  GJ:'Gujarat', HR:'Haryana', HP:'Himachal Pradesh', JK:'Jammu and Kashmir', JH:'Jharkhand', KA:'Karnataka', KL:'Kerala',
  LA:'Ladakh', LD:'Lakshadweep', MP:'Madhya Pradesh', MH:'Maharashtra', MN:'Manipur', ML:'Meghalaya', MZ:'Mizoram', NL:'Nagaland',
  OD:'Odisha', OR:'Odisha', PY:'Puducherry', PB:'Punjab', RJ:'Rajasthan', SK:'Sikkim', TN:'Tamil Nadu', TS:'Telangana', TG:'Telangana',
  TR:'Tripura', UP:'Uttar Pradesh', UK:'Uttarakhand', UA:'Uttarakhand', WB:'West Bengal'
};
const ALIASES: Record<string, string> = { 'orissa':'Odisha', 'uttaranchal':'Uttarakhand', 'nct of delhi':'Delhi',
  'delhi ncr':'Delhi', 'telengana':'Telangana', 'andaman & nicobar islands':'Andaman and Nicobar Islands',
  'pondicherry':'Puducherry', 'dadra and nagar haveli':'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu':'Dadra and Nagar Haveli and Daman and Diu' };
export function stateName(name: unknown, code: unknown): string {
  const c = String(code ?? '').trim().toUpperCase().replace(/^IN[-_]/, '');
  if (STATE_CODES[c]) return STATE_CODES[c];
  const raw = String(name ?? '').trim();
  if (!raw) return 'Unknown';
  const lower = raw.toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[lower] ?? Object.values(STATE_CODES).find(x => x.toLowerCase() === lower) ?? raw;
}
export function createReport(): Report { return { rows:new Map(), products:new Set(), orderCount:0, missingState:0 }; }
function add(report: Report, state:string, product:string, quantity:number, revenue:number, firstInOrder:boolean) {
  let states = report.rows.get(state);
  if (!states) { states = new Map(); report.rows.set(state, states); }
  let cell = states.get(product);
  if (!cell) { cell = {orders:0,units:0,revenue:0}; states.set(product,cell); }
  if (firstInOrder) cell.orders++;
  cell.units += quantity;
  cell.revenue += revenue;
  report.products.add(product);
}
export async function absorbJsonl(report:Report, url:string, storeName:string, signal?:AbortSignal):Promise<void> {
  // Only use a URL returned by Shopify bulkOperation API; caller validates its host.
  const response = await fetch(url, { signal, cache:'no-store' });
  if (!response.ok || !response.body) throw new Error(`Shopify bulk JSONL download failed: HTTP ${response.status}`);
  const decoder = new TextDecoder(); const reader = response.body.getReader(); let leftover='';
  let state = 'Unknown', orderId = '', isIndia = false;
  let seen = new Set<string>();
  function handle(line:string) {
    if (!line.trim()) return;
    const obj = JSON.parse(line) as Row;
    if (!obj.__parentId) {
      orderId = String(obj.id ?? '');
      const addr = (obj.shippingAddress ?? {}) as Record<string,unknown>;
      isIndia = String(addr.countryCodeV2 ?? '') === 'IN';
      state = stateName(addr.province, addr.provinceCode);
      seen = new Set<string>();
      if (isIndia) { report.orderCount++; if (state === 'Unknown') report.missingState++; }
      return;
    }
    if (!isIndia || String(obj.__parentId) !== orderId) return;
    const product = (obj.product ?? {}) as Record<string,unknown>;
    const productId = String(product.id ?? obj.sku ?? obj.title ?? 'Unknown product');
    const title = String(product.title ?? obj.title ?? 'Unknown product');
    const key = `${storeName} / ${title} [${productId}]`;
    const quantity = Number(obj.quantity ?? 0);
    const price = (obj.discountedTotalSet as Record<string,unknown> | undefined)?.shopMoney as Record<string,unknown> | undefined;
    const revenue = Number(price?.amount ?? 0);
    const uniqueKey = `${orderId}|${productId}`;
    const first = !seen.has(uniqueKey);
    seen.add(uniqueKey);
    add(report, state, key, Number.isFinite(quantity) ? quantity : 0, Number.isFinite(revenue) ? revenue : 0, first);
  }
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      leftover += decoder.decode(value,{stream:true});
      let idx:number;
      while ((idx = leftover.indexOf('\n')) !== -1) { handle(leftover.slice(0,idx)); leftover = leftover.slice(idx+1); }
    }
    leftover += decoder.decode(); if (leftover.trim()) handle(leftover);
  } finally { reader.releaseLock(); }
}
const csv = (v:unknown):string => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
export function toCsv(report: Report, format:Format, metric:Metric):string {
  const states = [...report.rows.keys()].sort((a,b)=>a.localeCompare(b));
  const products = [...report.products].sort((a,b)=>a.localeCompare(b));
  const value = (s:string,p:string):number => report.rows.get(s)?.get(p)?.[metric] ?? 0;
  const lines:string[]=[];
  if (format === 'matrix') {
    lines.push(['State',...products,'Total'].map(csv).join(','));
    for(const s of states) lines.push([s,...products.map(p=>value(s,p)),products.reduce((n,p)=>n+value(s,p),0)].map(csv).join(','));
    lines.push(['Grand Total',...products.map(p=>states.reduce((n,s)=>n+value(s,p),0)),states.reduce((total,s)=>total+products.reduce((n,p)=>n+value(s,p),0),0)].map(csv).join(','));
  } else {
    lines.push(['Product','State','Orders','Units','Revenue'].join(','));
    for(const p of products) for(const s of states) {
      const cell = report.rows.get(s)?.get(p); if (cell) lines.push([p,s,cell.orders,cell.units,cell.revenue].map(csv).join(','));
    }
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}
