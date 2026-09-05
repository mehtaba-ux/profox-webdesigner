import CareerJobsAdminLegacy from './CareerJobsAdminLegacy';
import ContentWriterApplicationFormAdminPanel from './ContentWriterApplicationFormAdminPanel';

// UIUXApplicationFormEditor remains rendered inside CareerJobsAdminLegacy; this
// wrapper only adds the Content Writer form builder without replacing it.
export default function CareerJobsAdmin(){
  return <>
    <CareerJobsAdminLegacy/>
    <ContentWriterApplicationFormAdminPanel/>
  </>;
}
