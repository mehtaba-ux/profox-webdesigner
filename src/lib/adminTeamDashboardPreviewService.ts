import { supabase } from './supabase';

export interface TeamDashboardPreviewAudit {
  eventId: number;
  userId: string;
  department: string;
  role: string;
  status: string;
  openedAt: string;
  readOnly: true;
}

export const adminTeamDashboardPreviewService = {
  async recordOpen(userId: string): Promise<TeamDashboardPreviewAudit> {
    const { data, error } = await supabase.rpc('admin_record_team_dashboard_preview', {
      p_user_id: userId,
    });
    if (error) throw new Error(error.message || 'The team dashboard preview could not be authorized.');
    if (!data?.readOnly || data?.userId !== userId) {
      throw new Error('The server did not authorize a read-only team dashboard preview.');
    }
    return data as TeamDashboardPreviewAudit;
  },
};
