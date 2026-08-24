import { supabase } from './supabase';
import { BookingManagement, BookingSlot, bookingService } from './bookingService';

export const bookingManagementService = {
  get: (token: string) => bookingService.getManagedBooking(token),
  reschedule: (token: string, startAt: string, visitorTimezone: string) => bookingService.rescheduleManagedBooking(token, startAt, visitorTimezone),
  cancel: (token: string, reason = '') => bookingService.cancelManagedBooking(token, reason),
  async slots(token: string, fromDate?: string, days = 14): Promise<BookingSlot[]> {
    const { data, error } = await supabase.rpc('get_public_reschedule_slots', {
      p_token: token,
      p_from_date: fromDate || null,
      p_days: days
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      startAt: row.start_at,
      endAt: row.end_at,
      timezone: row.timezone || 'UTC',
      durationMinutes: Number(row.duration_minutes || 30)
    }));
  }
};

export type { BookingManagement };
