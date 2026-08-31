
import { profileService } from './src/lib/profileService';
import { isSupabaseConfigured } from './src/lib/supabase';

async function listUsers() {
  console.log('Checking Supabase configuration...');
  if (!isSupabaseConfigured) {
    console.error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
    return;
  }

  console.log('Fetching all user profiles...');
  const { data, error } = await profileService.getAllProfiles();

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log(`Found ${data.length} profiles:`);
  data.forEach(p => {
    console.log(`- ${p.email} [${p.role}] [${p.status}] ID: ${p.id}`);
  });
}

listUsers().catch(console.error);
