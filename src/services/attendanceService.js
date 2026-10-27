import { fetchAll, supabase, unwrap } from './serviceUtils'

export const attendanceService = {
  async attendance(monthKey) {
    return fetchAll((from, to) => supabase
      .rpc('attendance_for_cycle', { p_month_key: monthKey })
      .range(from, to))
  },

  async saveAbsence(personId, attendanceDate, type) {
    return unwrap(await supabase.rpc('upsert_absence_type', {
      p_person_id: personId,
      p_date: attendanceDate,
      p_type: type || null,
    }))
  },

  async saveAttendanceNote(personId, attendanceDate, note) {
    return unwrap(await supabase.rpc('upsert_attendance_note', {
      p_person_id: personId,
      p_date: attendanceDate,
      p_note: note,
    }))
  },
}
