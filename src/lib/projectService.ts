import { supabase } from './supabase';
import { ClientProject } from '../types';

const LOCAL_PROJECTS_KEY = 'profox_client_projects';

const DEFAULT_PROJECTS: ClientProject[] = [
  {
    id: 'proj_demo_1',
    clientId: 'client_1',
    clientName: 'Demo Client',
    clientEmail: 'demo@example.com',
    projectName: 'Premium E-Commerce Redesign',
    status: 'development',
    progress: 65,
    startDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    targetEndDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    milestones: [
      {
        id: 'm1',
        title: 'Project Kickoff & Discovery',
        description: 'Initial requirements gathering and project scope definition.',
        status: 'approved',
        dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'm2',
        title: 'UI/UX Design & Wireframes',
        description: 'Creating high-fidelity mockups for core pages.',
        status: 'approved',
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'm3',
        title: 'Frontend Development',
        description: 'Converting designs into responsive React components.',
        status: 'in_progress',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'm4',
        title: 'Backend Integration & Testing',
        description: 'Wiring up APIs and performing quality assurance.',
        status: 'pending',
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'm5',
        title: 'Final Review & Launch',
        description: 'Final walkthrough and deployment to production.',
        status: 'pending',
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      }
    ],
    files: [
      {
        id: 'f1',
        name: 'Project_Scope_Agreement.pdf',
        url: '#',
        type: 'application/pdf',
        uploadedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'f2',
        name: 'Design_Mockups_V1.fig',
        url: '#',
        type: 'application/octet-stream',
        uploadedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      }
    ],
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  }
];

export const getProjects = async (): Promise<ClientProject[]> => {
  try {
    const cached = localStorage.getItem(LOCAL_PROJECTS_KEY);
    let projects: ClientProject[] = cached ? JSON.parse(cached) : DEFAULT_PROJECTS;

    const { data: dbData } = await supabase.from('client_projects').select('*');
    if (dbData && dbData.length > 0) {
      projects = dbData;
    }

    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
    return projects;
  } catch (e) {
    return DEFAULT_PROJECTS;
  }
};

export const getProjectByEmail = async (email: string): Promise<ClientProject | null> => {
  const projects = await getProjects();
  const project = projects.find(p => p.clientEmail.toLowerCase() === email.toLowerCase());
  return project || null;
};

export const saveProject = async (project: ClientProject): Promise<ClientProject> => {
  const projects = await getProjects();
  const index = projects.findIndex(p => p.id === project.id);
  
  const updatedProject = { ...project, updatedAt: new Date().toISOString() };
  
  if (index >= 0) {
    projects[index] = updatedProject;
  } else {
    projects.push(updatedProject);
  }
  
  localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
  
  try {
    await supabase.from('client_projects').upsert(updatedProject);
  } catch (e) {
    console.warn('Supabase save project fallback', e);
  }
  
  return updatedProject;
};

export const approveMilestone = async (projectId: string, milestoneId: string): Promise<ClientProject | null> => {
  const projects = await getProjects();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  
  if (projectIndex === -1) return null;
  
  const project = projects[projectIndex];
  const milestoneIndex = project.milestones.findIndex(m => m.id === milestoneId);
  
  if (milestoneIndex === -1) return null;
  
  project.milestones[milestoneIndex].status = 'approved';
  project.milestones[milestoneIndex].completedAt = new Date().toISOString();
  
  return saveProject(project);
};
