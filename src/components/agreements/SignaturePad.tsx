import React,{useEffect,useRef,useState}from'react';

export default function SignaturePad({onChange,label='Draw your signature'}:{onChange:(svg:string)=>void;label?:string}){
 const ref=useRef<HTMLCanvasElement|null>(null);const ink=useRef(false);const[drawing,setDrawing]=useState(false);
 const setup=()=>{const c=ref.current;if(!c)return;const r=c.getBoundingClientRect();const dpr=window.devicePixelRatio||1;const previous=ink.current?c.toDataURL('image/png'):'';c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr));const x=c.getContext('2d');if(!x)return;x.scale(dpr,dpr);x.lineWidth=2;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#000080';if(previous){const image=new Image();image.onload=()=>x.drawImage(image,0,0,r.width,r.height);image.src=previous}};
 useEffect(()=>{setup();const f=()=>setup();window.addEventListener('resize',f);return()=>window.removeEventListener('resize',f)},[]);
 const pos=(e:React.PointerEvent<HTMLCanvasElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
 const start=(e:React.PointerEvent<HTMLCanvasElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);const p=pos(e),x=ref.current?.getContext('2d');if(!x)return;x.beginPath();x.moveTo(p.x,p.y);setDrawing(true)};
 const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!drawing)return;const p=pos(e),x=ref.current?.getContext('2d');if(!x)return;x.lineTo(p.x,p.y);x.stroke();ink.current=true};
 const emit=()=>{const c=ref.current;if(!c||!ink.current)return;const png=c.toDataURL('image/png');onChange(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180"><rect width="600" height="180" fill="white"/><image href="${png}" width="600" height="180" preserveAspectRatio="none"/></svg>`)};
 const finish=()=>{setDrawing(false);emit()};
 const clear=()=>{const c=ref.current,x=c?.getContext('2d');if(c&&x)x.clearRect(0,0,c.width,c.height);ink.current=false;onChange('')};
 return <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-slate-700">{label}</span><button type="button" onClick={clear} className="text-xs font-bold text-[#000080]">Clear</button></div><canvas ref={ref} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} className="h-40 w-full touch-none rounded-xl border border-slate-300 bg-white"/><p className="mt-2 text-[11px] leading-5 text-slate-500">Use a mouse, touchscreen, stylus or pen-enabled screen.</p></div>
}
