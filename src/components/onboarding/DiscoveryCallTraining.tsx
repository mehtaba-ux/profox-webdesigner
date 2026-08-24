import React,{useEffect,useMemo,useState}from'react';
import ReactMarkdown from'react-markdown';
import{ArrowLeft,ArrowRight,BookOpen,CheckCircle2,Headphones,Loader2,RefreshCw,ShieldCheck,Target,Users}from'lucide-react';
import{TrainingLesson,TrainingModule,UserProgress}from'../../lib/trainingService';
import{DiscoveryAssessmentResult,DiscoveryTrainingConfig,discoveryCallTrainingService}from'../../lib/discoveryCallTrainingService';
import{useStandardAssessmentResume}from'../../hooks/useStandardAssessmentResume';

type Props={module:TrainingModule;lessons:TrainingLesson[];progress?:UserProgress;onRefresh:()=>Promise<void>};
type View='learn'|'assessment'|'result';
const errorText=(error:any,fallback:string)=>error?.message||fallback;

export default function DiscoveryCallTraining({module,lessons,progress,onRefresh}:Props){
 const[config,setConfig]=useState<DiscoveryTrainingConfig|null>(null);
 const[view,setView]=useState<View>('learn');
 const[lessonIndex,setLessonIndex]=useState(0);
 const[questionIndex,setQuestionIndex]=useState(0);
 const[confirmStage,setConfirmStage]=useState(false);
 const[answers,setAnswers]=useState<number[]>([]);
 const[acks,setAcks]=useState<Record<string,boolean>>({});
 const[result,setResult]=useState<DiscoveryAssessmentResult|null>(null);
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[message,setMessage]=useState('');

 const load=async()=>{
  setLoading(true);setError('');
  try{
   const{data,error:e}=await discoveryCallTrainingService.getConfig(module.id);
   if(e||!data)throw e||new Error('Discovery training configuration is unavailable.');
   setConfig(data);
   const done=Number(data.lessonsCompleted||0);
   setLessonIndex(Math.min(done,Math.max(lessons.length-1,0)));
   setAnswers(old=>old.length===data.questions.length?old:Array(data.questions.length).fill(-1));
   setAcks(old=>Object.keys(old).length?old:Object.fromEntries(data.acknowledgements.map(item=>[item.id,false])));
   if(progress?.status==='Passed'||progress?.status==='Completed'||data.latestAttempt?.passed)setView('result');
   else if(done>=lessons.length&&lessons.length>0)setView(current=>current==='learn'?'assessment':current);
  }catch(e:any){setError(errorText(e,'Module 9 could not be loaded.'));}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[module.id,progress?.status,lessons.length]);

 const certified=progress?.status==='Passed'||progress?.status==='Completed'||result?.passed===true||config?.latestAttempt?.passed===true;
 const lessonsDone=!!config&&lessons.length>0&&config.lessonsCompleted>=lessons.length;
 const requiredAcks=useMemo(()=>config?.acknowledgements.filter(item=>item.required)||[],[config]);
 const allAcks=requiredAcks.every(item=>acks[item.id]);
 const allAnswered=!!config&&config.questions.length>0&&answers.length===config.questions.length&&answers.every(value=>Number.isInteger(value)&&value>=0);
 const currentQuestion=config?.questions[questionIndex];
 const latest=config?.latestAttempt;

 useStandardAssessmentResume({
  moduleId:module.id,loading,terminal:certified,retryRequired:progress?.status==='Retry Required',lessonsDone,
  lessonCount:lessons.length,questionCount:config?.questions.length||0,view,lessonIndex,questionIndex,confirmStage,answers,acknowledgements:acks,
  setView,setLessonIndex,setQuestionIndex,setConfirmStage,setAnswers,setAcknowledgements:setAcks
 });

 const completeLesson=async()=>{
  if(!progress||!lessons[lessonIndex])return;
  setBusy(true);setError('');setMessage('');
  const{data,error:e}=await discoveryCallTrainingService.completeLesson(progress.id,lessons[lessonIndex].id);
  if(e)setError(errorText(e,'Lesson progress could not be saved.'));
  else{
   const done=Number((data as any)?.lessonsCompleted||0);
   setConfig(current=>current?{...current,lessonsCompleted:done}:current);
   await onRefresh();
   if(done>=lessons.length){setView('assessment');setQuestionIndex(0);setConfirmStage(false);setMessage('All 18 discovery lessons are complete. Your scenario certification is unlocked.');}
   else setLessonIndex(done);
  }
  setBusy(false);
 };

 const submit=async()=>{
  if(!progress||!config)return;
  if(!allAnswered){setError('Answer every discovery scenario before submitting.');return;}
  if(!allAcks){setError('Confirm every required ProFox discovery standard before submitting.');return;}
  setBusy(true);setError('');setMessage('');
  const ids=requiredAcks.filter(item=>acks[item.id]).map(item=>item.id);
  const{data,error:e}=await discoveryCallTrainingService.submitAssessment(progress.id,answers,ids);
  if(e)setError(errorText(e,'Discovery certification could not be scored.'));
  else if(data){setResult(data);setView('result');await onRefresh();await load();}
  setBusy(false);
 };

 const retake=()=>{
  if(!config)return;
  setAnswers(Array(config.questions.length).fill(-1));
  setAcks(Object.fromEntries(config.acknowledgements.map(item=>[item.id,false])));
  setQuestionIndex(0);setConfirmStage(false);setResult(null);setError('');setMessage('');setView('assessment');
 };

 if(loading)return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
 if(!config)return <Notice danger>{error||'Module 9 is unavailable.'}</Notice>;

 if(certified&&view==='result'){
  const score=result?.score??progress?.score??latest?.score??100;
  return <div className="space-y-5">
   <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
    <div className="flex items-start gap-4"><CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600"/><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Module 9 Certified</div><h2 className="mt-1 text-2xl font-black text-emerald-950">Discovery / Call Script Passed</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900">You have demonstrated the ProFox discovery standard: diagnose before prescribing, uncover commercial meaning, preserve trust, and leave every legitimate opportunity with a clear next step. Module 10 will now focus on practising this skill.</p><div className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-black text-emerald-800">Certification score: {score}/100</div></div></div>
   </section><Framework value={config.framework}/>
  </div>;
 }

 return <div className="space-y-6">
  <section className="rounded-3xl bg-gradient-to-r from-[#000080] to-[#FF0E0E] p-7 text-white shadow-xl">
   <div className="text-[10px] font-black uppercase tracking-[.2em] text-white/75">Module 9 · Discovery Mastery</div>
   <h2 className="mt-2 text-2xl font-black">Discovery / Call Script</h2>
   <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85">Learn to understand the buyer's business, uncover root causes and impact, qualify honestly, and earn the right to recommend the next step.</p>
   <div className="mt-5 grid gap-3 sm:grid-cols-4"><Stat icon={<BookOpen className="h-4 w-4"/>} value={`${config.lessonsCompleted}/${lessons.length}`} label="Lessons"/><Stat icon={<Target className="h-4 w-4"/>} value={`${config.passingScore}/100`} label="Pass Standard"/><Stat icon={<ShieldCheck className="h-4 w-4"/>} value="0" label="Critical Misses"/><Stat icon={<Users className="h-4 w-4"/>} value="Module 10" label="Practice Next"/></div>
  </section>

  <Framework value={config.framework}/>
  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex items-center gap-2"><Headphones className="h-5 w-5 text-[#000080]"/><h3 className="font-black">Discovery coaching benchmarks</h3></div>
   <p className="mt-1 text-xs leading-5 text-slate-500">Use these as coaching references, never robotic quotas. The quality of understanding matters more than hitting a number.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-3"><Mini label="Targeted questions" value={config.coachingBenchmarks?.targetedQuestions||'11–14 reference'}/><Mini label="Problems explored" value={config.coachingBenchmarks?.problemFocus||'3–4 meaningful'}/><Mini label="Talk / listen" value={config.coachingBenchmarks?.talkListen||'≈46% / 54%'}/></div>
  </section>

  {latest&&!latest.passed&&<Notice><strong>Previous attempt:</strong> {latest.score??0}/100 with {latest.criticalMisses??0} critical miss(es). Review the coaching explanations, then retry the scenarios.</Notice>}
  {error&&<Notice danger>{error}</Notice>}{message&&<Notice>{message}</Notice>}

  <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1"><Tab active={view==='learn'} onClick={()=>setView('learn')}>1. Learn Discovery</Tab><Tab active={view==='assessment'} disabled={!lessonsDone} onClick={()=>{setView('assessment');setConfirmStage(false)}}>2. Scenario Certification</Tab></div>

  {view==='learn'&&<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
   <div className="mb-5 flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Lesson {lessonIndex+1} of {lessons.length}</div><h3 className="mt-1 text-lg font-black text-slate-950">{lessons[lessonIndex]?.title}</h3></div><BookOpen className="h-6 w-6 shrink-0 text-[#000080]"/></div>
   <div className="prose prose-slate max-w-none rounded-2xl bg-slate-50 p-6 text-sm leading-7"><ReactMarkdown>{lessons[lessonIndex]?.content||''}</ReactMarkdown></div>
   <div className="mt-5 flex items-center justify-between gap-3"><button disabled={lessonIndex===0} onClick={()=>setLessonIndex(index=>Math.max(0,index-1))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4"/>Previous</button>{lessonIndex<config.lessonsCompleted?<button onClick={()=>setLessonIndex(index=>Math.min(lessons.length-1,index+1))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">Review Next<ArrowRight className="h-4 w-4"/></button>:!lessonsDone&&<button disabled={busy||!progress} onClick={()=>void completeLesson()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40">Mark Learned & Continue<ArrowRight className="h-4 w-4"/></button>}</div>
  </section>}

  {view==='assessment'&&!confirmStage&&currentQuestion&&<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
   <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Discovery scenario {questionIndex+1} of {config.questions.length} · Progress saved</div><h3 className="mt-2 max-w-4xl text-base font-black leading-6 text-slate-950">{currentQuestion.prompt}</h3></div><Target className="h-6 w-6 shrink-0 text-[#000080]"/></div>
   <div className="mt-5 grid gap-3">{currentQuestion.options.map((option,index)=><button key={index} type="button" onClick={()=>setAnswers(previous=>previous.map((value,i)=>i===questionIndex?index:value))} className={`rounded-2xl border p-4 text-left text-sm leading-6 transition ${answers[questionIndex]===index?'border-[#000080] bg-blue-50 text-blue-950 ring-2 ring-blue-100':'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}><span className="mr-2 font-black">{String.fromCharCode(65+index)}.</span>{option}</button>)}</div>
   <div className="mt-6 flex justify-between"><button disabled={questionIndex===0} onClick={()=>setQuestionIndex(index=>Math.max(0,index-1))} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4"/>Previous</button><button disabled={answers[questionIndex]<0} onClick={()=>{if(questionIndex>=config.questions.length-1)setConfirmStage(true);else setQuestionIndex(index=>index+1)}} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40">{questionIndex>=config.questions.length-1?'Review Standards':'Next Scenario'}<ArrowRight className="h-4 w-4"/></button></div>
  </section>}

  {view==='assessment'&&confirmStage&&<section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
   <div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Final certification check · Progress saved</div><h3 className="mt-1 text-lg font-black">Confirm the ProFox discovery standards</h3><p className="mt-1 text-xs leading-5 text-slate-500">Every required acknowledgement must be confirmed before the server scores your 25 scenarios.</p></div>
   <div className="grid gap-3">{config.acknowledgements.map(item=><label key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6"><input type="checkbox" checked={!!acks[item.id]} onChange={event=>setAcks(previous=>({...previous,[item.id]:event.target.checked}))} className="mt-1"/><span>{item.statement}{item.required&&<strong className="ml-1 text-red-600">*</strong>}</span></label>)}</div>
   <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-950"><strong>Scoring rule:</strong> At least {config.passingScore}/100 and zero critical misses. This certifies knowledge and judgment; Module 10 provides practice, and Module 11 remains the human-reviewed mock-call proof.</div>
   <div className="flex flex-col gap-3 sm:flex-row"><button onClick={()=>{setConfirmStage(false);setQuestionIndex(config.questions.length-1)}} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-xs font-black"><ArrowLeft className="h-4 w-4"/>Review Answers</button><button disabled={busy||!allAnswered||!allAcks} onClick={()=>void submit()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40"><ShieldCheck className="h-4 w-4"/>{busy?'Scoring securely...':'Submit Discovery Certification'}</button></div>
  </section>}

  {view==='result'&&!certified&&<FailedResult result={result||latest as any} passingScore={config.passingScore} onRetake={retake}/>} 
 </div>;
}

function FailedResult({result,passingScore,onRetake}:{result:any;passingScore:number;onRetake:()=>void}){
 const feedback=Array.isArray(result?.feedback)?result.feedback.filter((item:any)=>!item.correct):[];
 return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><div className="flex gap-3"><RefreshCw className="h-6 w-6 shrink-0 text-amber-700"/><div className="flex-1"><div className="text-[10px] font-black uppercase tracking-widest text-amber-700">Retry Required</div><h3 className="mt-1 text-xl font-black text-amber-950">Score {result?.score??0}/100 · {result?.criticalMisses??0} critical miss(es)</h3><p className="mt-2 text-sm leading-6 text-amber-900">You need at least {passingScore}/100 and zero critical misses. Your completed lessons stay complete; use the coaching below and retry only the scenarios when ready.</p>{feedback.length>0&&<div className="mt-4 space-y-2">{feedback.slice(0,8).map((item:any)=><div key={item.questionId} className="rounded-xl bg-white p-3 text-xs leading-5 text-slate-700"><strong>{item.criticalMiss?'Critical coaching: ':'Review: '}</strong>{item.explanation}</div>)}</div>}<button onClick={onRetake} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white"><RefreshCw className="h-4 w-4"/>Retry Scenarios</button></div></div></section>;
}
function Framework({value}:{value:string}){return <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5"><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">ProFox Discovery Map</div><div className="mt-2 text-base font-black text-blue-950">{value}</div><p className="mt-2 text-xs leading-5 text-blue-800">Use it to navigate the conversation, not as a rigid script. Follow the buyer's meaning while ensuring no critical discovery area is missed.</p></section>}
function Stat({icon,value,label}:{icon:React.ReactNode;value:string;label:string}){return <div className="rounded-2xl border border-white/15 bg-white/10 p-3"><div className="flex items-center gap-2 text-white/80">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div><div className="mt-1 text-lg font-black">{value}</div></div>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-slate-900">{value}</div></div>}
function Tab({active,disabled,onClick,children}:{active:boolean;disabled?:boolean;onClick:()=>void;children:React.ReactNode}){return <button disabled={disabled} onClick={onClick} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-35 ${active?'bg-[#000080] text-white':'text-slate-600 hover:bg-slate-50'}`}>{children}</button>}
function Notice({danger=false,children}:{danger?:boolean;children:React.ReactNode}){return <div className={`rounded-2xl border p-4 text-sm leading-6 ${danger?'border-red-200 bg-red-50 text-red-900':'border-amber-200 bg-amber-50 text-amber-900'}`}>{children}</div>}
