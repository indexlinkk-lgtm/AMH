/**
 * audit.js — Audit Log Writer Helper
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Provides convenience wrappers for writing audit log entries
 * for all significant admin actions throughout the system.
 */

'use strict';

/**
 * Audit action type constants.
 * Use these constants to ensure consistent action_type strings.
 */
const AUDIT_ACTIONS = Object.freeze({
  // Patient management
  CREATE_PATIENT:        'CREATE_PATIENT',
  UPDATE_PATIENT:        'UPDATE_PATIENT',
  DEACTIVATE_PATIENT:    'DEACTIVATE_PATIENT',

  // Booking management
  VERIFY_PATIENT:        'VERIFY_PATIENT',
  START_CONSULTATION:    'START_CONSULTATION',
  COMPLETE_CONSULTATION: 'COMPLETE_CONSULTATION',
  MARK_NO_SHOW:          'MARK_NO_SHOW',
  CANCEL_BOOKING_ADMIN:  'CANCEL_BOOKING_ADMIN',

  // Prescription
  ISSUE_PRESCRIPTION:    'ISSUE_PRESCRIPTION',
  MARK_COLLECTED:        'MARK_COLLECTED',

  // Slot templates
  CREATE_OPD_SLOT:       'CREATE_OPD_SLOT',
  UPDATE_OPD_SLOT:       'UPDATE_OPD_SLOT',
  DELETE_OPD_SLOT:       'DELETE_OPD_SLOT',
  CREATE_CLINIC_SLOT:    'CREATE_CLINIC_SLOT',
  UPDATE_CLINIC_SLOT:    'UPDATE_CLINIC_SLOT',
  DELETE_CLINIC_SLOT:    'DELETE_CLINIC_SLOT',

  // Clinic management
  CREATE_CLINIC:         'CREATE_CLINIC',
  UPDATE_CLINIC:         'UPDATE_CLINIC',
  TOGGLE_CLINIC:         'TOGGLE_CLINIC',

  // Admin management
  CREATE_ADMIN:          'CREATE_ADMIN',
  DEACTIVATE_ADMIN:      'DEACTIVATE_ADMIN',
  ACTIVATE_ADMIN:        'ACTIVATE_ADMIN',
  ADMIN_LOGIN:           'ADMIN_LOGIN',
  ADMIN_LOGOUT:          'ADMIN_LOGOUT',

  // Blocked dates
  BLOCK_DATE:            'BLOCK_DATE',
  UNBLOCK_DATE:          'UNBLOCK_DATE',
});

/**
 * Write an audit log entry for a patient creation.
 * @param {string} adminId - UUID of admin who performed the action
 * @param {Object} patient - Newly created patient record
 * @returns {Promise<void>}
 */
async function auditCreatePatient(adminId, patient) {
  await writeAuditLog({
    admin_id: adminId,
    action_type: AUDIT_ACTIONS.CREATE_PATIENT,
    target_table: 'patients',
    target_id: patient.id,
    details: {
      unique_patient_id: patient.unique_patient_id,
      full_name: patient.full_name,
      nic_number: patient.nic_number,
    },
  });
}

/**
 * Write an audit log entry for booking status changes.
 * @param {string} adminId
 * @param {string} actionType - From AUDIT_ACTIONS
 * @param {string} bookingId - UUID
 * @param {string} bookingType - 'opd' | 'clinic'
 * @param {Object} details - Additional details
 * @returns {Promise<void>}
 */
async function auditBookingAction(adminId, actionType, bookingId, bookingType, details = {}) {
  await writeAuditLog({
    admin_id: adminId,
    action_type: actionType,
    target_table: bookingType === 'opd' ? 'opd_bookings' : 'clinic_bookings',
    target_id: bookingId,
    details: {
      booking_type: bookingType,
      ...details,
    },
  });
}

/**
 * Write an audit log for prescription issuance.
 * @param {string} adminId
 * @param {string} prescriptionId
 * @param {string} patientId
 * @param {Object} details
 * @returns {Promise<void>}
 */
async function auditIssuePrescription(adminId, prescriptionId, patientId, details = {}) {
  await writeAuditLog({
    admin_id: adminId,
    action_type: AUDIT_ACTIONS.ISSUE_PRESCRIPTION,
    target_table: 'prescriptions',
    target_id: prescriptionId,
    details: {
      patient_id: patientId,
      doctor_name: details.doctor_name,
      medicines_count: details.medicines?.length || 0,
    },
  });
}

/**
 * Write an audit log for pharmacy collection.
 * @param {string} adminId
 * @param {string} prescriptionId
 * @param {string} patientId
 * @returns {Promise<void>}
 */
async function auditMarkCollected(adminId, prescriptionId, patientId) {
  await writeAuditLog({
    admin_id: adminId,
    action_type: AUDIT_ACTIONS.MARK_COLLECTED,
    target_table: 'prescriptions',
    target_id: prescriptionId,
    details: { patient_id: patientId },
  });
}

/**
 * Write an audit log for OPD slot creation/deletion.
 * @param {string} adminId
 * @param {string} actionType
 * @param {string} templateId
 * @param {Object} details
 * @returns {Promise<void>}
 */
async function auditSlotAction(adminId, actionType, templateId, details = {}) {
  await writeAuditLog({
    admin_id: adminId,
    action_type: actionType,
    target_table: actionType.includes('CLINIC') ? 'clinic_slot_templates' : 'opd_slot_templates',
    target_id: templateId,
    details,
  });
}

/**
 * Write an audit log for clinic management actions.
 * @param {string} adminId
 * @param {string} actionType
 * @param {string} clinicId
 * @param {Object} details
 * @returns {Promise<void>}
 */
async function auditClinicAction(adminId, actionType, clinicId, details = {}) {
  await writeAuditLog({
    admin_id: adminId,
    action_type: actionType,
    target_table: 'clinics',
    target_id: clinicId,
    details,
  });
}

/**
 * Write an audit log for admin account management.
 * @param {string} superAdminId
 * @param {string} actionType
 * @param {string} targetAdminId
 * @param {Object} details
 * @returns {Promise<void>}
 */
async function auditAdminAction(superAdminId, actionType, targetAdminId, details = {}) {
  await writeAuditLog({
    admin_id: superAdminId,
    action_type: actionType,
    target_table: 'admin_users',
    target_id: targetAdminId,
    details,
  });
}

/**
 * Write an audit log for blocked/unblocked dates.
 * @param {string} adminId
 * @param {string} actionType - BLOCK_DATE | UNBLOCK_DATE
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
async function auditDateAction(adminId, actionType, dateStr, reason) {
  await writeAuditLog({
    admin_id: adminId,
    action_type: actionType,
    target_table: 'blocked_dates',
    details: { date: dateStr, reason },
  });
}
