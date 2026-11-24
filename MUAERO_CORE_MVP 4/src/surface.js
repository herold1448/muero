// Visual surfaces are derived from OSM centre lines. Their edges are not surveyed.
// Shared join vertices remove the gaps and overlaps caused by per-segment quads.
export function surfacePolygon(points,width){
  if(points.length<2||!Number.isFinite(width)||width<=0)return null;
  const side=[[],[]],half=width/2;
  for(let i=0;i<points.length;i++){
    const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    const unit=(a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz);return n>.001?{x:-dz/n,z:dx/n}:null;};
    const a=unit(prev,p)||unit(p,next),b=unit(p,next)||a;
    if(!a||!b)return null;
    const mx=a.x+b.x,mz=a.z+b.z,dot=(mx*a.x+mz*a.z)/2;
    // Clamp acute corners to a bevel-like join to avoid long spikes.
    const scale=dot>.25?Math.min(2,1/dot):1;
    const n=dot>.25?{x:mx*.5*scale,z:mz*.5*scale}:b;
    side[0].push({x:p.x+n.x*half,z:p.z+n.z*half});
    side[1].push({x:p.x-n.x*half,z:p.z-n.z*half});
  }
  return side;
}

export function widthEvidence(way,review,type,fallback){
  const raw=review?.width??way.tags?.width;
  const metres=typeof raw==='number'?raw:Number(String(raw??'').replace(/\s*m$/i,''));
  if(Number.isFinite(metres)&&metres>=.5&&metres<=25)return {metres,source:review?.width!=null?'관리자 기록':'OSM 폭 태그'};
  return {metres:fallback,source:`${type} 중심선 주변 시각화 추정 · 경계 미측량`};
}
