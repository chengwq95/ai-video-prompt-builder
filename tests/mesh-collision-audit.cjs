// Independent checks against posed mesh triangles, rather than the editor's collision proxies.
function auditMesh(surface, M, T, pose, prop) {
  const J=M.skeleton(pose);surface.update(J,pose);
  const geo=surface.geometry, ids=geo.getAttribute('skinIndex'),weights=geo.getAttribute('skinWeight'),indices=geo.index.array;
  const names=surface.skeleton.bones.map(b=>b.name),point=new T.Vector3(),positions=[],worldY=[];
  const R=J.bodyM,inverse=[R[0],R[3],R[6],R[1],R[4],R[7],R[2],R[5],R[8]],local=q=>M.mv(inverse,M.sub(q,J.pelvis));
  const w=(i,test)=>[0,1,2,3].reduce((s,c)=>s+(test(names[ids.array[i*4+c]])?weights.array[i*4+c]/255:0),0);
  const arm=n=>/^[lr](Upper|Fore|Hand|thumb|index|middle|ring|pinky)/.test(n);
  const body=[]; const armWeights={l:[],r:[]};
  for(let i=0;i<surface.vertices;i++){surface.body.getVertexPosition(i,point);worldY.push(point.y);positions.push(local(point.toArray()));body.push(w(i,arm)<.25);for(const side of ['l','r'])armWeights[side].push(w(i,n=>n.startsWith(side)&&arm(n)));}
  const cell=.045*J.scale,grid=new Map();
  for(let i=0;i<indices.length;i+=3){const t=[indices[i],indices[i+1],indices[i+2]];if(!t.every(v=>body[v]))continue;
    const a=positions[t[0]],b=positions[t[1]],c=positions[t[2]],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)continue;
    const row={a,b,c,den};for(let x=Math.floor(Math.min(a[0],b[0],c[0])/cell);x<=Math.floor(Math.max(a[0],b[0],c[0])/cell);x++)for(let y=Math.floor(Math.min(a[1],b[1],c[1])/cell);y<=Math.floor(Math.max(a[1],b[1],c[1])/cell);y++){const key=x+':'+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(row);}}
  const triangle=new T.Triangle(),query=new T.Vector3(),nearest=new T.Vector3();
  function depth(p){const hits=[];
    for(const {a,b,c,den} of grid.get(Math.floor(p[0]/cell)+':'+Math.floor(p[1]/cell))||[]){const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/den,v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/den;if(u<-1e-8||v<-1e-8||u+v>1+1e-8)continue;const z=u*a[2]+v*b[2]+(1-u-v)*c[2];if(z>p[2]+1e-7)hits.push(z-p[2]);}
    hits.sort((a,b)=>a-b);const unique=hits.filter((v,i)=>i===0||v-hits[i-1]>1e-6);
    if(!(unique.length%2))return 0;
    const epsilon=.004*J.scale,seen=new Set();query.fromArray(p);
    for(let x=Math.floor((p[0]-epsilon)/cell);x<=Math.floor((p[0]+epsilon)/cell);x++)for(let y=Math.floor((p[1]-epsilon)/cell);y<=Math.floor((p[1]+epsilon)/cell);y++)for(const row of grid.get(x+':'+y)||[]){if(seen.has(row))continue;seen.add(row);if(p[2]<Math.min(row.a[2],row.b[2],row.c[2])-epsilon||p[2]>Math.max(row.a[2],row.b[2],row.c[2])+epsilon)continue;triangle.a.fromArray(row.a);triangle.b.fromArray(row.b);triangle.c.fromArray(row.c);triangle.closestPointToPoint(query,nearest);if(nearest.distanceTo(query)<epsilon)return 0;}
    return unique[0];
  }
  const counts={l:0,r:0,prop:0},worst={l:0,r:0,prop:0},examples=[];
  for(const side of ['l','r'])for(let i=0;i<surface.vertices;i+=3){if(armWeights[side][i]<.75)continue;
    const upper=w(i,n=>n===side+'Upper');if(upper>.25){const ax=M.sub(local(J[side+'Elbow']),local(J[side+'Shoulder'])),t=M.dot(M.sub(positions[i],local(J[side+'Shoulder'])),ax)/M.dot(ax,ax);if(t<.40)continue;}
    const d=depth(positions[i]);if(d>.004*J.scale){counts[side]++;worst[side]=Math.max(worst[side],d);if(examples.length<8)examples.push({side,vertex:i,position:positions[i],upper});}}
  if(prop){const F=M.propFrame(pose,prop,J); const dims={phone:[.071,.147,.009],book:[.16,.222,.026],cup:[.084,.1,.084],umbrella:[.02,.10,.02]}[prop];
    for(let x=0;x<=6;x++)for(let y=0;y<=8;y++)for(const z of [-.5,.5]){const q=M.add(F.position,M.mv(F.matrix,[dims[0]*(x/6-.5)*F.scale,dims[1]*(y/8-.5)*F.scale,dims[2]*z*F.scale]));const d=depth(local(q));if(d>.003*J.scale){counts.prop++;worst.prop=Math.max(worst.prop,d);}}}
  let floor=Infinity;
  for(let i=0;i<surface.vertices;i++)if(w(i,n=>/^[lr](Foot|Toes)$/.test(n))>.7)floor=Math.min(floor,worldY[i]);
  if(pose.seated){
    const chair=pose.props.includes('chair'),top=surface.seatSupport(J,chair);counts.seat=0;counts.legs=0;
    for(let i=0;i<surface.vertices;i++){
      const q=positions[i],x=q[0]/J.scale,z=q[2]/J.scale;
      const inside=chair?Math.abs(x)<.218&&z>-.248&&z<.168:Math.hypot(x,z+.06)<.203;
      if(inside&&worldY[i]<top-.002*J.scale&&worldY[i]>top-(chair?.045:.055)*J.scale+.002*J.scale)counts.seat++;
    }
    for(const x of chair?[-.19,.19]:[-.135,.135])for(const z of chair?[-.22,.14]:[-.19,.07])for(let y=.02*J.scale;y<top-.055*J.scale;y+=.025*J.scale){const d=depth([x*J.scale,y-J.pelvis[1],z*J.scale]);if(d>.004*J.scale)counts.legs++;}
    if(chair){counts.back=0;for(let i=0;i<surface.vertices;i++){const q=positions[i],x=q[0]/J.scale,z=q[2]/J.scale;if(Math.abs(x)<.218&&z>-.2555&&z<-.2245&&worldY[i]>top+.002*J.scale&&worldY[i]<top+.458*J.scale)counts.back++;}}
  }
  return {counts,worst,examples,floor};
}
module.exports={auditMesh};
