import { supabase } from './supabase';
import { BookingManagement as BaseBookingManagement, BookingSlot, bookingService } from './bookingService';

export type BookingManagement = BaseBookingManagement & {
  attendanceStatus?: 'Pending' | 'Confirmed';
};

export const bookingManagementService = {
  get: async (token: string): Promise<BookingManagement> => bookingService.getManagedBooking(token) as Promise<BookingManagement>,
  reschedule: async (token: string, startAt: string, visitorTimezone: string): Promise<BookingManagement> => bookingService.rescheduleManagedBooking(token, startAt, visitorTimezone) as Promise<BookingManagement>,
  cancel: async (token: string, reason = ''): Promise<BookingManagement> => bookingService.cancelManagedBooking(token, reason) as Promise<BookingManagement>,
  async confirmAttendance(token: string): Promise<BookingManagement> {
    const { data, error } = await supabase.rpc('confirm_meeting_attendance', { p_token: token });
    if (error) throw error;
    return data as BookingManagement;
  },
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
