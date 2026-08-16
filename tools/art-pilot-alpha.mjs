/** Alpha histogram for the pilot outputs — proves whether "partial alpha" is
 *  edge anti-aliasing (fine) or a translucent body (would wash out on dark). */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
const ROOT = process.argv[2];
function walk(d){ let o=[]; for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory()) o=o.concat(walk(p)); else if(/\.png$/i.test(e.name)) o.push(p);} return o; }
const b = await chromium.launch(); const pg = await b.newPage(); await pg.goto('about:blank');
console.log('file\ta=0\ta1-127\ta128-239\ta240-254\ta=255\tmeanA(of a>0)');
for (const f of walk(ROOT)) {
  const du = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const r = await pg.evaluate(async (du) => {
    const im = new Image(); im.src = du; await im.decode();
    const c = document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
    const g = c.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
    const d = g.getImageData(0,0,c.width,c.height).data;
    let z=0,lo=0,mid=0,hi=0,full=0,sum=0,n=0;
    for(let i=3;i<d.length;i+=4){ const a=d[i];
      if(a===0){z++;continue;} sum+=a;n++;
      if(a<128)lo++; else if(a<240)mid++; else if(a<255)hi++; else full++; }
    return {z,lo,mid,hi,full,mean:n?(sum/n).toFixed(1):'-'};
  }, du);
  console.log([path.relative(ROOT,f).replace(/\\/g,'/'), r.z, r.lo, r.mid, r.hi, r.full, r.mean].join('\t'));
}
await b.close();
