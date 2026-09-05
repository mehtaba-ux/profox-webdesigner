import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CareerJob } from '../lib/careerService';
import ContentWriterApplicationForm from '../components/careers/ContentWriterApplicationForm';
import ContentWriterJobViewLegacy from './ContentWriterJobViewLegacy';

interface Props { job: CareerJob }

export default function ContentWriterJobView({job}:Props){
  const [target,setTarget]=useState<HTMLElement|null>(null);

  useEffect(()=>{
    const section=document.getElementById('apply');
    setTarget(section);
  },[]);

  return <>
    <style>{`#apply > form { display: none !important; }`}</style>
    <ContentWriterJobViewLegacy job={job}/>
    {target?createPortal(<ContentWriterApplicationForm job={job}/>,target):null}
  </>;
}
