export type ContentWriterFieldType = 'text'|'email'|'tel'|'url'|'textarea'|'number'|'date'|'select'|'multiselect'|'checkbox'|'file'|'video';

export interface ContentWriterApplicationStep {
  id:string;
  title:string;
  description?:string;
  active?:boolean;
}

export interface ContentWriterApplicationField {
  key:string;
  stepId:string;
  label:string;
  type:ContentWriterFieldType;
  help?:string;
  placeholder?:string;
  required?:boolean;
  active?:boolean;
  options?:string[];
  min?:number;
  max?:number;
  minLength?:number;
  system?:boolean;
  locked?:boolean;
  accept?:string;
}

export interface ContentWriterApplicationFormConfig {
  schemaVersion:number;
  title?:string;
  description?:string;
  minimumWeeklyHours:number;
  portfolioDeferred:boolean;
  portfolioRequired:boolean;
  cvRequired:boolean;
  steps:ContentWriterApplicationStep[];
  fields:ContentWriterApplicationField[];
}

export const CONTENT_WRITER_APPLICATION_SCHEMA_VERSION = 4;

export const DEFAULT_CONTENT_WRITER_APPLICATION_FORM:ContentWriterApplicationFormConfig = {
  schemaVersion:CONTENT_WRITER_APPLICATION_SCHEMA_VERSION,
  title:'Show Us How You Think—Not Just Where You’ve Worked.',
  description:'A short, five-step application. Your full three-case-study portfolio is collected later only if you pass the initial review.',
  minimumWeeklyHours:20,
  portfolioDeferred:true,
  portfolioRequired:false,
  cvRequired:true,
  steps:[
    {id:'about',title:'About You',description:'Start with the basics so we know who we are speaking with.',active:true},
    {id:'experience',title:'Your Experience',description:'Tell us what you have worked on and where your writing experience comes from.',active:true},
    {id:'thinking',title:'How You Think',description:'We care about research, judgment and accuracy—not just polished sentences.',active:true},
    {id:'availability',title:'Availability',description:'Help us understand the project load you can responsibly support.',active:true},
    {id:'confirm',title:'Application & Confirmation',description:'Upload your CV, share your introduction-video link, and confirm the working terms before submitting.',active:true},
  ],
  fields:[
    {key:'fullName',stepId:'about',label:'Full name',type:'text',required:true,active:true,system:true,locked:true,help:'Use the name you want us to use throughout recruitment.',minLength:2},
    {key:'email',stepId:'about',label:'Email address',type:'email',required:true,active:true,system:true,locked:true,help:'Use an email address you check regularly. Recruitment updates are sent here.'},
    {key:'phone',stepId:'about',label:'Phone',type:'tel',active:true,system:true,help:'Include your country code if possible.'},
    {key:'country',stepId:'about',label:'Country',type:'text',required:true,active:true,system:true,help:'Your current country of residence.'},
    {key:'currentRole',stepId:'about',label:'Current role',type:'text',active:true,system:true,help:'Your current job title, freelance role or main professional focus.'},
    {key:'linkedinUrl',stepId:'about',label:'LinkedIn profile',type:'url',active:true,system:true,help:'Optional. Add a public LinkedIn profile if you have one.',placeholder:'https://linkedin.com/in/...' },

    {key:'yearsExperience',stepId:'experience',label:'Professional website/commercial writing experience',type:'select',required:true,active:true,help:'Count paid or professional work involving website, landing-page, UX, SEO or commercial copy.',options:['Less than 1 year','1–2 years','3–5 years','6+ years']},
    {key:'contentTypes',stepId:'experience',label:'What types of content have you worked on professionally?',type:'multiselect',required:true,active:true,help:'Select every type you have delivered professionally.',options:['Website Copy','Landing Pages','Service Pages','SEO Content','UX Copy','Email Copy','Other']},
    {key:'realBusinessExperience',stepId:'experience',label:'Have you written website or conversion content for real businesses or paying clients?',type:'select',required:true,active:true,help:'Practice projects are useful, but this helps us understand your real delivery experience.',options:['Yes','No']},
    {key:'contentExperience',stepId:'experience',label:'Describe your relevant website or commercial content-writing experience',type:'textarea',required:true,active:true,system:true,help:'Focus on the work you personally did, the type of businesses or projects, and your responsibility. 3–6 thoughtful sentences is enough.',minLength:30},

    {key:'researchApproach',stepId:'thinking',label:'How do you research a business, its customers and its market before writing?',type:'textarea',required:true,active:true,system:true,help:'Explain your actual process. We want to understand how you find reliable information before writing.',minLength:30},
    {key:'claimVerification',stepId:'thinking',label:'A client says, “We have helped 500+ customers,” but no evidence has been provided. What would you do before using that claim?',type:'textarea',required:true,active:true,help:'This tests how you handle unsupported business claims. Do not tell us what sounds impressive—tell us what you would actually do.',minLength:30},
    {key:'qualityProcess',stepId:'thinking',label:'How do you check accuracy, clarity, structure and quality before submitting content?',type:'textarea',required:true,active:true,system:true,help:'Walk us through your own QA process before another reviewer sees the work.',minLength:30},
    {key:'skills',stepId:'thinking',label:'Which writing, research, SEO, AI, collaboration or productivity tools do you use?',type:'text',active:true,system:true,help:'List the tools you regularly use. Tool names alone do not determine selection.'},
    {key:'aiJudgment',stepId:'thinking',label:'If you use AI, how do you use it without replacing your research, judgment or fact-checking?',type:'textarea',required:true,active:true,help:'Explain where AI may assist and how you verify the final output before submitting it.',minLength:30},

    {key:'availableHoursPerWeek',stepId:'availability',label:'Available project capacity per week',type:'number',required:true,active:true,system:true,locked:true,help:'This is capacity while actively accepting projects—not guaranteed paid hours. Payment is agreed per project.',min:20,max:80},
    {key:'currentWorkload',stepId:'availability',label:'How many active client or writing projects are you currently managing?',type:'select',required:true,active:true,help:'This helps us compare your stated capacity with your current workload.',options:['0','1–2','3–4','5+']},
    {key:'earliestStartDate',stepId:'availability',label:'Earliest available start date',type:'date',active:true,system:true,help:'The earliest date you could realistically begin an accepted project.'},
    {key:'weeklyAvailability',stepId:'availability',label:'Typical weekly availability',type:'textarea',active:true,system:true,help:'Mention the days or working windows when you are normally available.'},
    {key:'deadlineScenario',stepId:'availability',label:'If you realize an accepted project may miss its deadline, what would you do?',type:'textarea',required:true,active:true,help:'We are looking for ownership, early communication and a practical recovery plan.',minLength:20},
    {key:'motivation',stepId:'availability',label:'Why do you want to work with the ProFox Content team?',type:'textarea',active:true,system:true,help:'Keep this specific. Tell us what fits your goals and working style.'},

    {key:'cv',stepId:'confirm',label:'CV / Resume',type:'file',required:true,active:true,system:true,locked:true,help:'Upload PDF, DOC or DOCX. Your portfolio is not required at this stage.',accept:'.pdf,.doc,.docx'},
    {key:'video',stepId:'confirm',label:'Introduction video link',type:'url',required:true,active:true,system:true,locked:true,help:'Record a short introduction and paste a shareable Loom, YouTube, Vimeo, Google Drive or other video link that we can open without requesting access.',placeholder:'https://www.loom.com/share/...' },
    {key:'hasLaptopInternet',stepId:'confirm',label:'I have access to a reliable laptop and internet connection.',type:'checkbox',required:true,active:true,system:true,locked:true,help:'Reliable equipment and connectivity are required for remote project delivery.'},
    {key:'consentAccurate',stepId:'confirm',label:'The information and materials I submit accurately represent my experience and work.',type:'checkbox',required:true,active:true,system:true,locked:true},
    {key:'contractorAck',stepId:'confirm',label:'I understand that I am initially applying for project-based independent contractor work rather than an immediate salaried position.',type:'checkbox',required:true,active:true,system:true,locked:true},
    {key:'projectPaymentAck',stepId:'confirm',label:'I understand that payment during the project-based stage is agreed per project.',type:'checkbox',required:true,active:true,system:true,locked:true},
    {key:'earningPotentialAck',stepId:'confirm',label:'I understand that $1,000–$1,500+ per month is a potential earning opportunity and not guaranteed income.',type:'checkbox',required:true,active:true,system:true,locked:true},
    {key:'earningVariablesAck',stepId:'confirm',label:'I understand that actual earnings depend on available projects, project fees, my capacity, performance and successful delivery.',type:'checkbox',required:true,active:true,system:true,locked:true},
    {key:'salaryPathAck',stepId:'confirm',label:'I understand that strong performance for at least six months can create an opportunity to transition into a salaried ProFox role, with salary and applicable terms discussed at that time.',type:'checkbox',required:true,active:true,system:true,locked:true},
    {key:'consentPrivacy',stepId:'confirm',label:'I agree that ProFox may process this information for recruitment and assessment purposes.',type:'checkbox',required:true,active:true,system:true,locked:true},
  ],
};

const fieldTypes:ContentWriterFieldType[]=['text','email','tel','url','textarea','number','date','select','multiselect','checkbox','file','video'];
const systemByKey=new Map(DEFAULT_CONTENT_WRITER_APPLICATION_FORM.fields.filter(field=>field.system).map(field=>[field.key,field]));

const stringArray=(value:unknown)=>Array.isArray(value)?value.filter(item=>typeof item==='string').map(item=>item.trim()).filter(Boolean):[];

export function getContentWriterApplicationFormConfig(input:any):ContentWriterApplicationFormConfig{
  const raw=input&&typeof input==='object'?input:{};
  const stepsRaw=Array.isArray(raw.steps)?raw.steps:DEFAULT_CONTENT_WRITER_APPLICATION_FORM.steps;
  const seenSteps=new Set<string>();
  const steps=stepsRaw.map((step:any,index:number)=>({
    id:String(step?.id||`step-${index+1}`).trim().replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,60),
    title:String(step?.title||`Step ${index+1}`).trim().slice(0,100),
    description:String(step?.description||'').trim().slice(0,400),
    active:step?.active!==false,
  })).filter(step=>step.id&&!seenSteps.has(step.id)&&(seenSteps.add(step.id),true));
  const activeStepIds=new Set(steps.map(step=>step.id));
  const rawFields=Array.isArray(raw.fields)?raw.fields:DEFAULT_CONTENT_WRITER_APPLICATION_FORM.fields;
  const seenFields=new Set<string>();
  const fields:ContentWriterApplicationField[]=[];
  for(const candidate of rawFields){
    if(!candidate||typeof candidate!=='object')continue;
    const key=String(candidate.key||'').trim().replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
    if(!key||seenFields.has(key))continue;
    const system=systemByKey.get(key);
    const type=(fieldTypes.includes(candidate.type)?candidate.type:(system?.type||'text')) as ContentWriterFieldType;
    const stepId=activeStepIds.has(String(candidate.stepId))?String(candidate.stepId):(system?.stepId||steps[0]?.id||'about');
    fields.push({
      key,
      stepId,
      label:String(candidate.label||system?.label||key).trim().slice(0,300),
      type:system?.locked?system.type:type,
      help:String(candidate.help||'').trim().slice(0,1000),
      placeholder:String(candidate.placeholder||'').trim().slice(0,500),
      required:system?.locked?true:Boolean(candidate.required),
      active:system?.locked?true:candidate.active!==false,
      options:(type==='select'||type==='multiselect')?stringArray(candidate.options).slice(0,50):undefined,
      min:Number.isFinite(Number(candidate.min))?Number(candidate.min):system?.min,
      max:Number.isFinite(Number(candidate.max))?Number(candidate.max):system?.max,
      minLength:Number.isFinite(Number(candidate.minLength))?Number(candidate.minLength):system?.minLength,
      system:Boolean(system||candidate.system),
      locked:Boolean(system?.locked||candidate.locked),
      accept:system?.accept||String(candidate.accept||'').trim()||undefined,
    });
    seenFields.add(key);
  }
  for(const requiredSystem of DEFAULT_CONTENT_WRITER_APPLICATION_FORM.fields.filter(field=>field.locked)){
    if(!seenFields.has(requiredSystem.key))fields.push({...requiredSystem});
  }
  return {
    schemaVersion:Math.max(CONTENT_WRITER_APPLICATION_SCHEMA_VERSION,Number(raw.schemaVersion||0)),
    title:String(raw.title||DEFAULT_CONTENT_WRITER_APPLICATION_FORM.title).trim().slice(0,200),
    description:String(raw.description||DEFAULT_CONTENT_WRITER_APPLICATION_FORM.description).trim().slice(0,1000),
    minimumWeeklyHours:Math.max(1,Math.min(80,Number(raw.minimumWeeklyHours||20))),
    portfolioDeferred:raw.portfolioDeferred!==false,
    portfolioRequired:Boolean(raw.portfolioRequired),
    cvRequired:raw.cvRequired!==false,
    steps:steps.length?steps:DEFAULT_CONTENT_WRITER_APPLICATION_FORM.steps.map(step=>({...step})),
    fields,
  };
}

export function serializeContentWriterApplicationFormConfig(config:ContentWriterApplicationFormConfig){
  return getContentWriterApplicationFormConfig(config);
}

export function makeCustomContentWriterField(index:number,stepId:string):ContentWriterApplicationField{
  return {key:`custom_${Date.now()}_${index}`,stepId,label:'New question',type:'text',help:'',placeholder:'',required:false,active:true,system:false,locked:false};
}
