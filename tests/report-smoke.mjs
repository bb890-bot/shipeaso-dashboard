import assert from 'node:assert/strict';
import pkg from '../.test-build/state-report.cjs';
const { createReport, absorbJsonl, toCsv } = pkg;
const objs=[
 {id:'gid://shopify/Order/1',shippingAddress:{countryCodeV2:'IN',province:'Maharashtra',provinceCode:'MH'}},
 {id:'gid://shopify/LineItem/1',__parentId:'gid://shopify/Order/1',title:'A',quantity:2,product:{id:'pA',title:'Product A'},discountedTotalSet:{shopMoney:{amount:'400'}}},
 {id:'gid://shopify/LineItem/2',__parentId:'gid://shopify/Order/1',title:'B',quantity:1,product:{id:'pB',title:'Product B'},discountedTotalSet:{shopMoney:{amount:'250'}}},
 {id:'gid://shopify/Order/2',shippingAddress:{countryCodeV2:'IN',province:'Uttar Pradesh',provinceCode:'UP'}},
 {id:'gid://shopify/LineItem/3',__parentId:'gid://shopify/Order/2',title:'A',quantity:1,product:{id:'pA',title:'Product A'},discountedTotalSet:{shopMoney:{amount:'200'}}},
 {id:'gid://shopify/Order/3',shippingAddress:{countryCodeV2:'US',province:'California',provinceCode:'CA'}},
 {id:'gid://shopify/LineItem/4',__parentId:'gid://shopify/Order/3',quantity:5,product:{id:'pA',title:'Product A'},discountedTotalSet:{shopMoney:{amount:'1000'}}}
];
global.fetch = async () => new Response(objs.map(x=>JSON.stringify(x)).join('\n'));
const report=createReport(); await absorbJsonl(report,'https://storage.googleapis.com/dummy','Shop 1');
assert.equal(report.orderCount,2);
const matrix=toCsv(report,'matrix','orders');
assert.match(matrix,/Maharashtra,1,1,2/);
assert.match(matrix,/Uttar Pradesh,1,0,1/);
assert.doesNotMatch(matrix,/California/);
assert.match(toCsv(report,'breakdown','units'),/Product A/);
console.log('PASS: normalization, India-only filtering, metrics, both exports');
