import React,{useEffect,useState}from'react';
import{Loader2}from'lucide-react';
import{useAuth}from'../../lib/AuthContext';
import{trainingService,TrainingLesson,TrainingModule,UserProgress}from'../../lib/trainingService';
import ProductPresentationTraining from'./ProductPresentationTraining';

interface ProductPresentationViewProps{onComplete?:()=>void}

export default function ProductPresentationView(_props:ProductPresentationViewProps){
 const{user}=useAuth();
 const[module,setModule]=useState<TrainingModule|null>(null);const[lessons,setLessons]=useState<TrainingLesson[]>([]);const[progress,setProgress]=useState<UserProgress|undefined>();
 const[loading,setLoading]=useState(true);const[error,setError]=useState('');

 const load=async()=>{
  if(!user)return;
  setLoading(true);setError('');
  try{
   const modulesResult=await trainingService.getModules();
   if(modulesResult.error)throw modulesResult.error;
   const target=(modulesResult.data||[]).find(item=>item.slug==='presentation-skills'||item.slug==='product-presentation');
   if(!target)throw new Error('Product Presentation module is unavailable.');
   const[lessonResult,progressResult]=await Promise.all([trainingService.getLessons(target.id),trainingService.getUserProgress(user.id)]);
   if(lessonResult.error)throw lessonResult.error;if(progressResult.error)throw progressResult.error;
   setModule(target);setLessons(lessonResult.data||[]);setProgress((progressResult.data||[]).find(item=>item.module_id===target.id));
  }catch(e:any){setError(e?.message||'Module 12 could not be loaded.');}
  finally{setLoading(false);}
 };

 useEffect(()=>{if(user)void load();},[user?.id]);
 if(loading)return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
 if(error||!module)return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error||'Product Presentation module is unavailable.'}</div>;
 return <ProductPresentationTraining module={module} lessons={lessons} progress={progress} onRefresh={load}/>;
}
