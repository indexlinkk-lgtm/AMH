/**
 * supabase.js — Supabase Client & Database Helper Functions
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Initializes the Supabase client and provides helper functions
 * for all database operations used throughout the application.
 */

'use strict';

/* ============================================================
   SUPABASE CLIENT INITIALIZATION
   ============================================================ */

/**
 * The initialized Supabase client.
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
let supabaseClient = null;

/**
 * Initialize the Supabase client using config.js values.
 * Must be called once before any DB operations.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function initSupabase() {
  if (supabaseClient) return supabaseClient;

  if (!window.supabase) {
    throw new Error('Supabase JS library not loaded. Check CDN script tag.');
  }

  if (
    !AMH_CONFIG.SUPABASE_URL ||
    AMH_CONFIG.SUPABASE_URL === 'https://YOUR_PROJECT_ID.supabase.co'
  ) {
    console.error('⚠️ Supabase URL not configured. Edit config.js with your project URL.');
  }

  supabaseClient = window.supabase.createClient(
    AMH_CONFIG.SUPABASE_URL,
    AMH_CONFIG.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'amh_admin_session',
      },
    }
  );

  return supabaseClient;
}

/**
 * Get the initialized Supabase client (throws if not initialized).
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getDB() {
  if (!supabaseClient) return initSupabase();
  return supabaseClient;
}

/* ============================================================
   PATIENT DATABASE OPERATIONS
   ============================================================ */

/**
 * Register a new patient by calling the generate_patient_id function
 * and inserting the patient record.
 * @param {Object} patientData - Patient fields
 * @param {string} patientData.full_name
 * @param {number} patientData.age
 * @param {string} patientData.gender
 * @param {string} patientData.address
 * @param {string} patientData.nic_number
 * @param {string} patientData.phone_number
 * @param {string} [patientData.guardian_name]
 * @param {string} [patientData.guardian_phone]
 * @param {string} [patientData.created_by_admin] - UUID if created by admin
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function registerPatient(patientData) {
  try {
    const db = getDB();

    // Step 1: Generate unique patient ID via Supabase function
    const { data: idData, error: idError } = await db.rpc('generate_patient_id');
    if (idError) {
      return { data: null, error: 'Failed to generate patient ID: ' + idError.message };
    }

    const unique_patient_id = idData;

    // Step 2: Insert patient record
    const insertPayload = {
      unique_patient_id,
      full_name: patientData.full_name.trim(),
      age: parseInt(patientData.age, 10),
      gender: patientData.gender,
      address: patientData.address.trim(),
      nic_number: normalizeNIC(patientData.nic_number),
      phone_number: normalizePhone(patientData.phone_number),
      guardian_name: patientData.guardian_name?.trim() || null,
      guardian_phone: patientData.guardian_phone
        ? normalizePhone(patientData.guardian_phone)
        : null,
      created_by_admin: patientData.created_by_admin || null,
    };

    const { data, error } = await db
      .from('patients')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        if (error.message.includes('nic_number')) {
          return { data: null, error: 'A patient with this NIC number is already registered.' };
        }
        if (error.message.includes('phone_number')) {
          return { data: null, error: 'A patient with this phone number is already registered.' };
        }
      }
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Authenticate a patient by unique_patient_id and last 4 digits of NIC.
 * @param {string} patientId - e.g. "AMH2026000123"
 * @param {string} nicLast4 - Last 4 characters of NIC
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function authenticatePatient(patientId, nicLast4) {
  try {
    const db = getDB();

    const { data, error } = await db
      .from('patients')
      .select('*')
      .eq('unique_patient_id', patientId.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return { data: null, error: 'Patient ID not found. Please check and try again.' };
    }

    // Verify NIC last 4 digits (case-insensitive)
    const storedNic = data.nic_number || '';
    const storedLast4 = storedNic.slice(-4).toUpperCase();
    const inputLast4 = nicLast4.trim().toUpperCase();

    if (storedLast4 !== inputLast4) {
      return { data: null, error: 'Invalid NIC verification code. Please try again.' };
    }

    // Update last_login_at
    await db
      .from('patients')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.id);

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Fetch a patient by their UUID.
 * @param {string} patientUUID
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function getPatientById(patientUUID) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('patients')
      .select('*')
      .eq('id', patientUUID)
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Search patients by unique ID, NIC, name, or phone for admin use.
 * @param {string} searchTerm
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function searchPatients(searchTerm) {
  try {
    const db = getDB();
    const term = searchTerm.trim();

    const { data, error } = await db
      .from('patients')
      .select('id, unique_patient_id, full_name, nic_number, phone_number, age, gender')
      .or(
        `unique_patient_id.ilike.%${term}%,` +
        `full_name.ilike.%${term}%,` +
        `nic_number.ilike.%${term}%,` +
        `phone_number.ilike.%${term}%`
      )
      .eq('is_active', true)
      .limit(20);

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Check if a NIC number is already registered.
 * @param {string} nic
 * @returns {Promise<boolean>}
 */
async function isNICTaken(nic) {
  try {
    const db = getDB();
    const { data } = await db
      .from('patients')
      .select('id')
      .eq('nic_number', normalizeNIC(nic))
      .single();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Check if a phone number is already registered.
 * @param {string} phone
 * @returns {Promise<boolean>}
 */
async function isPhoneTaken(phone) {
  try {
    const db = getDB();
    const { data } = await db
      .from('patients')
      .select('id')
      .eq('phone_number', normalizePhone(phone))
      .single();
    return !!data;
  } catch {
    return false;
  }
}

/* ============================================================
   BOOKING OPERATIONS
   ============================================================ */

/**
 * Fetch OPD bookings for a patient.
 * @param {string} patientId - Patient UUID
 * @param {Object} [filters]
 * @param {string} [filters.status] - Filter by status
 * @param {number} [filters.limit] - Max results (default 10)
 * @param {number} [filters.offset] - Pagination offset
 * @returns {Promise<{data: Array|null, count: number, error: string|null}>}
 */
async function getPatientOPDBookings(patientId, filters = {}) {
  try {
    const db = getDB();
    const limit = filters.limit || 10;
    const offset = filters.offset || 0;

    let query = db
      .from('opd_bookings')
      .select(`
        *,
        opd_slot_templates (
          start_time,
          end_time,
          day_of_week
        )
      `, { count: 'exact' })
      .eq('patient_id', patientId)
      .order('booking_date', { ascending: false })
      .order('booked_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error, count } = await query;
    if (error) return { data: null, count: 0, error: error.message };
    return { data, count: count || 0, error: null };
  } catch (err) {
    return { data: null, count: 0, error: err.message };
  }
}

/**
 * Fetch clinic bookings for a patient.
 * @param {string} patientId - Patient UUID
 * @param {Object} [filters]
 * @returns {Promise<{data: Array|null, count: number, error: string|null}>}
 */
async function getPatientClinicBookings(patientId, filters = {}) {
  try {
    const db = getDB();
    const limit = filters.limit || 10;
    const offset = filters.offset || 0;

    let query = db
      .from('clinic_bookings')
      .select(`
        *,
        clinics (
          clinic_name,
          specialty,
          doctor_name
        ),
        clinic_slot_templates (
          start_time,
          end_time,
          day_of_week,
          doctor_name
        )
      `, { count: 'exact' })
      .eq('patient_id', patientId)
      .order('booking_date', { ascending: false })
      .order('booked_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error, count } = await query;
    if (error) return { data: null, count: 0, error: error.message };
    return { data, count: count || 0, error: null };
  } catch (err) {
    return { data: null, count: 0, error: err.message };
  }
}

/**
 * Get all upcoming bookings for a patient (OPD + Clinic combined).
 * @param {string} patientId - Patient UUID
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getPatientUpcomingBookings(patientId) {
  try {
    const db = getDB();
    const today = getColomboDateString();

    const [opdResult, clinicResult] = await Promise.all([
      db
        .from('opd_bookings')
        .select(`*, opd_slot_templates(start_time, end_time)`)
        .eq('patient_id', patientId)
        .gte('booking_date', today)
        .in('status', ['pending', 'verified', 'in_consultation'])
        .order('booking_date', { ascending: true }),

      db
        .from('clinic_bookings')
        .select(`*, clinics(clinic_name, doctor_name), clinic_slot_templates(start_time, end_time, doctor_name)`)
        .eq('patient_id', patientId)
        .gte('booking_date', today)
        .in('status', ['pending', 'verified', 'in_consultation'])
        .order('booking_date', { ascending: true }),
    ]);

    if (opdResult.error) return { data: null, error: opdResult.error.message };
    if (clinicResult.error) return { data: null, error: clinicResult.error.message };

    // Tag each booking by type
    const opdBookings = (opdResult.data || []).map(b => ({ ...b, booking_type: 'opd' }));
    const clinicBookings = (clinicResult.data || []).map(b => ({ ...b, booking_type: 'clinic' }));

    // Merge and sort by date
    const combined = [...opdBookings, ...clinicBookings].sort((a, b) =>
      a.booking_date.localeCompare(b.booking_date)
    );

    return { data: combined, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Cancel a patient's OPD booking.
 * @param {string} bookingId - Booking UUID
 * @param {string} patientId - Patient UUID (for security check)
 * @param {string} [reason]
 * @returns {Promise<{error: string|null}>}
 */
async function cancelOPDBooking(bookingId, patientId, reason = 'Cancelled by patient') {
  try {
    const db = getDB();
    const { error } = await db
      .from('opd_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq('id', bookingId)
      .eq('patient_id', patientId)
      .in('status', ['pending']);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Cancel a patient's clinic booking.
 * @param {string} bookingId
 * @param {string} patientId
 * @param {string} [reason]
 * @returns {Promise<{error: string|null}>}
 */
async function cancelClinicBooking(bookingId, patientId, reason = 'Cancelled by patient') {
  try {
    const db = getDB();
    const { error } = await db
      .from('clinic_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq('id', bookingId)
      .eq('patient_id', patientId)
      .in('status', ['pending']);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Book an OPD slot using the atomic Supabase function.
 * @param {string} patientId
 * @param {string} bookingDate - "YYYY-MM-DD"
 * @param {string} templateId - UUID
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function bookOPDSlot(patientId, bookingDate, templateId) {
  try {
    const db = getDB();
    const { data, error } = await db.rpc('book_opd_slot', {
      p_patient_id: patientId,
      p_booking_date: bookingDate,
      p_template_id: templateId,
    });

    if (error) return { data: null, error: error.message };
    if (!data.success) return { data: null, error: data.error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Book a clinic slot using the atomic Supabase function.
 * @param {string} patientId
 * @param {string} clinicId
 * @param {string} bookingDate - "YYYY-MM-DD"
 * @param {string} templateId - UUID
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function bookClinicSlot(patientId, clinicId, bookingDate, templateId) {
  try {
    const db = getDB();
    const { data, error } = await db.rpc('book_clinic_slot', {
      p_patient_id: patientId,
      p_clinic_id: clinicId,
      p_booking_date: bookingDate,
      p_template_id: templateId,
    });

    if (error) return { data: null, error: error.message };
    if (!data.success) return { data: null, error: data.error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/* ============================================================
   SLOT TEMPLATE OPERATIONS
   ============================================================ */

/**
 * Get OPD slot templates for a given day of week.
 * @param {number} dayOfWeek - 0 (Sun) to 6 (Sat)
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getOPDTemplatesByDay(dayOfWeek) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('opd_slot_templates')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .order('start_time', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Get OPD slot availability for a specific date using the Supabase function.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getOPDAvailability(dateStr) {
  try {
    const db = getDB();
    const { data, error } = await db.rpc('get_opd_availability', { p_date: dateStr });
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Get clinic slot availability for a specific date.
 * @param {string} clinicId - UUID
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getClinicAvailability(clinicId, dateStr) {
  try {
    const db = getDB();
    const { data, error } = await db.rpc('get_clinic_availability', {
      p_clinic_id: clinicId,
      p_date: dateStr,
    });
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Get all OPD templates (all days) for admin management.
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getAllOPDTemplates() {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('opd_slot_templates')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Create a new OPD slot template.
 * @param {Object} templateData
 * @param {string} adminId
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function createOPDTemplate(templateData, adminId) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('opd_slot_templates')
      .insert({ ...templateData, created_by: adminId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { data: null, error: 'A time slot already exists at this start time for this day.' };
      }
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Update an OPD slot template.
 * @param {string} templateId
 * @param {Object} updates
 * @returns {Promise<{error: string|null}>}
 */
async function updateOPDTemplate(templateId, updates) {
  try {
    const db = getDB();
    const { error } = await db
      .from('opd_slot_templates')
      .update(updates)
      .eq('id', templateId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Soft-delete (deactivate) an OPD slot template.
 * @param {string} templateId
 * @returns {Promise<{error: string|null}>}
 */
async function deactivateOPDTemplate(templateId) {
  return updateOPDTemplate(templateId, { is_active: false });
}

/**
 * Get all clinic slot templates for a clinic (all days).
 * @param {string} clinicId
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getClinicTemplates(clinicId) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('clinic_slot_templates')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Create a clinic slot template.
 * @param {Object} templateData
 * @param {string} adminId
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function createClinicTemplate(templateData, adminId) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('clinic_slot_templates')
      .insert({ ...templateData, created_by: adminId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { data: null, error: 'A time slot already exists at this start time for this clinic/day.' };
      }
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Soft-delete (deactivate) a clinic slot template.
 * @param {string} templateId
 * @returns {Promise<{error: string|null}>}
 */
async function deactivateClinicTemplate(templateId) {
  try {
    const db = getDB();
    const { error } = await db
      .from('clinic_slot_templates')
      .update({ is_active: false })
      .eq('id', templateId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/* ============================================================
   CLINIC OPERATIONS
   ============================================================ */

/**
 * Get all active clinics.
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getActiveClinics() {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('clinics')
      .select('*')
      .eq('is_active', true)
      .order('clinic_name', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Get all clinics (active + inactive) for admin management.
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getAllClinics() {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('clinics')
      .select('*')
      .order('clinic_name', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Create a new clinic.
 * @param {Object} clinicData
 * @param {string} adminId
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function createClinic(clinicData, adminId) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('clinics')
      .insert({ ...clinicData, created_by: adminId })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Update a clinic.
 * @param {string} clinicId
 * @param {Object} updates
 * @returns {Promise<{error: string|null}>}
 */
async function updateClinic(clinicId, updates) {
  try {
    const db = getDB();
    const { error } = await db
      .from('clinics')
      .update(updates)
      .eq('id', clinicId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/* ============================================================
   BLOCKED DATES OPERATIONS
   ============================================================ */

/**
 * Get all blocked dates (future and past).
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getBlockedDates() {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('blocked_dates')
      .select('*')
      .order('blocked_date', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Get blocked dates as an array of date strings for calendar display.
 * @returns {Promise<string[]>} Array of "YYYY-MM-DD" strings
 */
async function getBlockedDateStrings() {
  const { data } = await getBlockedDates();
  if (!data) return [];
  return data.map(row => row.blocked_date);
}

/**
 * Add a blocked date.
 * @param {string} date - "YYYY-MM-DD"
 * @param {string} reason
 * @param {string} adminId
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function addBlockedDate(date, reason, adminId) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('blocked_dates')
      .insert({ blocked_date: date, reason, blocked_by: adminId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { data: null, error: 'This date is already blocked.' };
      }
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Remove a blocked date.
 * @param {string} blockedDateId - UUID
 * @returns {Promise<{error: string|null}>}
 */
async function removeBlockedDate(blockedDateId) {
  try {
    const db = getDB();
    const { error } = await db
      .from('blocked_dates')
      .delete()
      .eq('id', blockedDateId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Count bookings on a specific date (used for block-date warning).
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Promise<number>}
 */
async function countBookingsOnDate(dateStr) {
  try {
    const db = getDB();
    const [opdResult, clinicResult] = await Promise.all([
      db
        .from('opd_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('booking_date', dateStr)
        .not('status', 'in', '("cancelled","no_show")'),
      db
        .from('clinic_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('booking_date', dateStr)
        .not('status', 'in', '("cancelled","no_show")'),
    ]);

    return (opdResult.count || 0) + (clinicResult.count || 0);
  } catch {
    return 0;
  }
}

/* ============================================================
   ADMIN QUEUE / BOOKING STATUS OPERATIONS
   ============================================================ */

/**
 * Get today's OPD queue for admin.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getTodaysOPDQueue(dateStr) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('opd_bookings')
      .select(`
        *,
        patients (
          unique_patient_id,
          full_name,
          nic_number,
          phone_number,
          age,
          gender
        ),
        opd_slot_templates (
          start_time,
          end_time
        )
      `)
      .eq('booking_date', dateStr)
      .order('template_id', { ascending: true })
      .order('slot_number', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Get today's clinic queue for admin.
 * @param {string} clinicId
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getTodaysClinicQueue(clinicId, dateStr) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('clinic_bookings')
      .select(`
        *,
        patients (
          unique_patient_id,
          full_name,
          nic_number,
          phone_number,
          age,
          gender
        ),
        clinic_slot_templates (
          start_time,
          end_time,
          doctor_name
        ),
        clinics (
          clinic_name,
          doctor_name
        )
      `)
      .eq('clinic_id', clinicId)
      .eq('booking_date', dateStr)
      .order('slot_number', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Update a booking's status (OPD or clinic).
 * @param {string} bookingType - 'opd' | 'clinic'
 * @param {string} bookingId - UUID
 * @param {string} newStatus
 * @param {string} adminId - UUID of admin making the change
 * @returns {Promise<{error: string|null}>}
 */
async function updateBookingStatus(bookingType, bookingId, newStatus, adminId) {
  try {
    const db = getDB();
    const table = bookingType === 'opd' ? 'opd_bookings' : 'clinic_bookings';

    const updates = { status: newStatus };
    if (newStatus === 'verified') {
      updates.verified_by = adminId;
      updates.verified_at = new Date().toISOString();
    }

    const { error } = await db
      .from(table)
      .update(updates)
      .eq('id', bookingId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/* ============================================================
   PRESCRIPTION OPERATIONS
   ============================================================ */

/**
 * Issue a prescription.
 * @param {Object} prescriptionData
 * @param {string} adminId
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function issuePrescription(prescriptionData, adminId) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('prescriptions')
      .insert({ ...prescriptionData, issued_by: adminId })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Get prescriptions for a patient.
 * @param {string} patientId
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getPatientPrescriptions(patientId) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('prescriptions')
      .select(`
        *,
        admin_users!prescriptions_issued_by_fkey (
          full_name
        )
      `)
      .eq('patient_id', patientId)
      .order('issued_at', { ascending: false });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Mark a prescription as collected by pharmacy.
 * @param {string} prescriptionId
 * @param {string} adminId
 * @returns {Promise<{error: string|null}>}
 */
async function markPrescriptionCollected(prescriptionId, adminId) {
  try {
    const db = getDB();
    const { error } = await db
      .from('prescriptions')
      .update({
        pharmacy_collected: true,
        collected_at: new Date().toISOString(),
        collected_by_admin: adminId,
      })
      .eq('id', prescriptionId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/* ============================================================
   ADMIN USER OPERATIONS
   ============================================================ */

/**
 * Get all admin users.
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
async function getAllAdmins() {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Fetch admin record by their Supabase Auth UID.
 * Uses RPC function to bypass RLS on first login.
 * @param {string} authUid
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function getAdminByAuthId(authUid) {
  try {
    const db = getDB();
    console.log('[AMH] getAdminByAuthId called with UID:', authUid);

    // Try RPC first (SECURITY DEFINER bypasses RLS)
    const { data: rpcData, error: rpcError } = await db
      .rpc('get_admin_by_id', { p_id: authUid });

    console.log('[AMH] RPC result:', { rpcData, rpcError });

    if (!rpcError && rpcData && rpcData.length > 0) {
      console.log('[AMH] RPC success:', rpcData[0]);
      return { data: rpcData[0], error: null };
    }

    if (rpcError) {
      console.warn('[AMH] RPC failed (function may not exist):', rpcError.message);
    } else {
      console.warn('[AMH] RPC returned empty — no admin found with UID:', authUid);
    }

    // Fallback: direct table query
    console.log('[AMH] Trying direct table query...');
    const { data, error } = await db
      .from('admin_users')
      .select('*')
      .eq('id', authUid)
      .single();

    console.log('[AMH] Direct query result:', { data, error });

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error('[AMH] getAdminByAuthId exception:', err.message);
    return { data: null, error: err.message };
  }
}

/**
 * Toggle admin active status.
 * @param {string} adminId - UUID
 * @param {boolean} isActive
 * @returns {Promise<{error: string|null}>}
 */
async function setAdminActiveStatus(adminId, isActive) {
  try {
    const db = getDB();
    const { error } = await db
      .from('admin_users')
      .update({ is_active: isActive })
      .eq('id', adminId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Insert an admin_users record (called after Supabase Auth user creation).
 * @param {Object} adminData - { id, full_name, email, role, created_by }
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function insertAdminRecord(adminData) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('admin_users')
      .insert(adminData)
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/* ============================================================
   AUDIT LOG OPERATIONS
   ============================================================ */

/**
 * Write an audit log entry.
 * @param {Object} logData
 * @param {string} logData.admin_id
 * @param {string} logData.action_type
 * @param {string} [logData.target_table]
 * @param {string} [logData.target_id]
 * @param {Object} [logData.details]
 * @returns {Promise<{error: string|null}>}
 */
async function writeAuditLog(logData) {
  try {
    const db = getDB();
    const { error } = await db.from('audit_logs').insert({
      admin_id: logData.admin_id,
      action_type: logData.action_type,
      target_table: logData.target_table || null,
      target_id: logData.target_id || null,
      details: logData.details || null,
      performed_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('Audit log write failed:', error.message);
      return { error: error.message };
    }
    return { error: null };
  } catch (err) {
    console.warn('Audit log exception:', err.message);
    return { error: err.message };
  }
}

/**
 * Fetch paginated audit logs for super admin.
 * @param {Object} filters
 * @param {string} [filters.adminId]
 * @param {string} [filters.actionType]
 * @param {string} [filters.dateFrom]
 * @param {string} [filters.dateTo]
 * @param {number} [filters.limit]
 * @param {number} [filters.offset]
 * @returns {Promise<{data: Array|null, count: number, error: string|null}>}
 */
async function getAuditLogs(filters = {}) {
  try {
    const db = getDB();
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let query = db
      .from('audit_logs')
      .select(`
        *,
        admin_users (
          full_name,
          role,
          email
        )
      `, { count: 'exact' })
      .order('performed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.adminId) query = query.eq('admin_id', filters.adminId);
    if (filters.actionType) query = query.eq('action_type', filters.actionType);
    if (filters.dateFrom) query = query.gte('performed_at', filters.dateFrom);
    if (filters.dateTo) query = query.lte('performed_at', filters.dateTo);

    const { data, error, count } = await query;
    if (error) return { data: null, count: 0, error: error.message };
    return { data, count: count || 0, error: null };
  } catch (err) {
    return { data: null, count: 0, error: err.message };
  }
}

/* ============================================================
   REPORTS / ANALYTICS
   ============================================================ */

/**
 * Get today's OPD stats for the dashboard.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Promise<Object>} { total, completed, noShow, pending }
 */
async function getTodaysOPDStats(dateStr) {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('opd_bookings')
      .select('status')
      .eq('booking_date', dateStr);

    if (error || !data) return { total: 0, completed: 0, noShow: 0, pending: 0 };

    return {
      total: data.length,
      completed: data.filter(b => b.status === 'completed').length,
      noShow: data.filter(b => b.status === 'no_show').length,
      pending: data.filter(b => b.status === 'pending').length,
    };
  } catch {
    return { total: 0, completed: 0, noShow: 0, pending: 0 };
  }
}

/**
 * Get monthly registration count for the last 12 months.
 * @returns {Promise<Array<{month: string, count: number}>>}
 */
async function getMonthlyRegistrations() {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('patients')
      .select('created_at')
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    // Group by year-month
    const counts = {};
    data.forEach(row => {
      const date = new Date(row.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    // Return last 12 months
    const result = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({
        month: new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(d),
        count: counts[key] || 0,
      });
    }
    return result;
  } catch {
    return [];
  }
}

/* ============================================================
   REALTIME SUBSCRIPTIONS
   ============================================================ */

/**
 * Subscribe to realtime updates for OPD bookings (today's date).
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {Function} callback - Called with the payload on change
 * @returns {Object} Supabase channel (call .unsubscribe() to clean up)
 */
function subscribeToOPDBookings(dateStr, callback) {
  const db = getDB();
  return db
    .channel(`opd_bookings_${dateStr}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'opd_bookings',
        filter: `booking_date=eq.${dateStr}`,
      },
      callback
    )
    .subscribe();
}

/**
 * Subscribe to realtime updates for prescriptions for a patient.
 * @param {string} patientId - Patient UUID
 * @param {Function} callback
 * @returns {Object} Supabase channel
 */
function subscribeToPrescriptions(patientId, callback) {
  const db = getDB();
  return db
    .channel(`prescriptions_${patientId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'prescriptions',
        filter: `patient_id=eq.${patientId}`,
      },
      callback
    )
    .subscribe();
}

/* ============================================================
   AUTO-INITIALIZE ON LOAD
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try { initSupabase(); } catch (err) { console.error('Supabase init failed:', err.message); }
  });
} else {
  try { initSupabase(); } catch (err) { console.error('Supabase init failed:', err.message); }
}
