// One static page: fetches /stats, draws inline SVG with currentColor so light and dark both work.
export const page = () => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Zen stats</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--mut:#777;--ac:#b8892b;--card:#f4f2ee}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--fg:#eee;--mut:#999;--card:#1e1e1e}}
body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font:15px system-ui}
h1{font-size:20px}h2{font-size:14px;color:var(--mut);margin:0 0 8px;font-weight:500}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.c{background:var(--card);border-radius:16px;padding:16px}.big{font-size:36px;font-weight:600}
svg{width:100%;height:auto;display:block}text{fill:var(--mut);font-size:10px}
</style><h1>Zen stats</h1><div class=g id=g></div>
<script>
const f=(n,d=3)=>Number(n).toFixed(d),W=300,H=140,P=24;
const card=(t,b)=>'<div class=c><h2>'+t+'</h2>'+b+'</div>';
const sc=(v,lo,hi,a,b)=>hi===lo?(a+b)/2:a+(v-lo)/(hi-lo)*(b-a);
function bars(items){if(!items.length)return'<p>No data</p>';
const hi=Math.max(...items.map(i=>i.v),1e-9),lo=Math.min(0,...items.map(i=>i.v)),bw=(W-P)/items.length;
return'<svg viewBox="0 0 '+W+' '+H+'">'+items.map((it,i)=>{const y0=sc(0,lo,hi,H-P,8),y=sc(it.v,lo,hi,H-P,8);
return'<rect x="'+(P+i*bw+1)+'" y="'+Math.min(y,y0)+'" width="'+(bw-2)+'" height="'+Math.abs(y0-y)+'" fill="var(--ac)"/><text x="'+(P+i*bw+bw/2)+'" y="'+(H-8)+'" text-anchor="middle">'+it.l+'</text>'}).join('')+'</svg>'}
function lines(series){const pts=series.flatMap(s=>s.points);if(!pts.length)return'<p>No data</p>';
const x0=Math.min(...pts.map(p=>p.day)),x1=Math.max(...pts.map(p=>p.day)),lo=Math.min(0,...pts.map(p=>p.cum)),hi=Math.max(...pts.map(p=>p.cum),1e-9);
return'<svg viewBox="0 0 '+W+' '+H+'">'+series.map((s,i)=>'<polyline fill=none stroke="var(--ac)" opacity="'+(0.4+0.6*(i+1)/series.length)+'" stroke-width=2 points="'+s.points.map(p=>sc(p.day,x0,x1,P,W-6)+','+sc(p.cum,lo,hi,H-P,8)).join(' ')+'"/>').join('')+'</svg>'}
function ci(p){const all=p.map(x=>x.reward.ci).flat(),lo=Math.min(...all),hi=Math.max(...all),rh=(H-16)/Math.max(p.length,1);
return'<svg viewBox="0 0 '+W+' '+H+'">'+p.map((x,i)=>{const y=12+i*rh+rh/2;
return'<line x1="'+sc(x.reward.ci[0],lo,hi,70,W-8)+'" x2="'+sc(x.reward.ci[1],lo,hi,70,W-8)+'" y1="'+y+'" y2="'+y+'" stroke="var(--ac)" stroke-width=3 /><circle cx="'+sc(x.reward.mean,lo,hi,70,W-8)+'" cy="'+y+'" r=4 fill="var(--fg)"/><text x=2 y="'+(y+3)+'">'+x.policy+' n='+x.n+'</text>'}).join('')+'</svg>'}
fetch('/stats').then(r=>r.json()).then(s=>{
g.innerHTML=card('Zero edit rate, 7 days','<div class=big>'+f(s.zeroEdit7d.rate*100,1)+'%</div><p>'+s.installs+' installs, '+s.zeroEdit7d.n+' rows</p>')
+card('Policy reward, mean and 95% CI',ci(s.policies))
+card('Kept rate per kind',bars(s.kinds.map(k=>({l:k.kind,v:k.keptRate}))))
+card('Mean reward per kind',bars(s.kinds.map(k=>({l:k.kind,v:k.meanReward}))))
+card('Reward by hour arm',bars(s.hours.map(h=>({l:h.arm,v:h.meanReward}))))
+card('Cumulative reward per cohort',lines(s.cumulative))
+card('Mean feature weights',bars(s.weights.map((v,i)=>({l:i,v}))))});
</script>`;
