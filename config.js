/**
 * config.js — Supabase Configuration
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://supabase.com and create a new project
 * 2. Navigate to: Project Settings → API
 * 3. Copy your "Project URL" and "anon public" key
 * 4. Replace the placeholder values below
 * 5. Never commit real credentials to public repositories
 *
 * For production: Use environment variables or a build step
 * to inject these values and keep them out of source control.
 */

const AMH_CONFIG = {
  /**
   * Supabase project URL
   * Format: https://xxxxxxxxxxxxxxxxxxxx.supabase.co
   */
  SUPABASE_URL: 'https://uqyzlusxacqidcjnfkxm.supabase.co',

  /**
   * Supabase anon (public) key — safe for frontend use
   * This key is locked down by Row Level Security policies
   */
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeXpsdXN4YWNxaWRjam5ma3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0ODM3NjEsImV4cCI6MjA4NzA1OTc2MX0.Jby-M3Kte2_MtO53xq8uWL9zTa4W-mvBxcYpQ-pyfv4',

  /**
   * Application configuration
   */
  APP: {
    NAME: 'AMH Patient Management System',
    SHORT_NAME: 'AMH',
    HOSPITAL_NAME: 'Ashraff Hospital Kalmunai',
    COUNTRY: 'Sri Lanka',
    TIMEZONE: 'Asia/Colombo',
    UTC_OFFSET: '+05:30',

    /**
     * Patient session configuration (milliseconds)
     * Auto-logout after 15 minutes of inactivity
     */
    SESSION_TIMEOUT_MS: 15 * 60 * 1000,       // 15 minutes
    SESSION_WARNING_MS: 14 * 60 * 1000,         // Show warning at 14 min
    SESSION_WARNING_DURATION_MS: 60 * 1000,     // 60-second warning

    /**
     * Booking configuration
     */
    MAX_ADVANCE_BOOKING_DAYS: 30,               // Max days ahead patient can book
    CANCELLATION_WINDOW_HOURS: 2,               // Hours before slot time to allow cancel
    AVG_CONSULTATION_MINUTES: 10,               // Used for wait time estimation

    /**
     * Kiosk auto-reset delay after registration
     */
    KIOSK_RESET_DELAY_MS: 10 * 1000,           // 10 seconds

    /**
     * Toast notification display duration
     */
    TOAST_DURATION_MS: 4000,                    // 4 seconds

    /**
     * Patient ID format: AMH + YEAR + 6-digit sequence
     * Example: AMH2026000123
     */
    PATIENT_ID_PREFIX: 'AMH',
    PATIENT_ID_SEQ_DIGITS: 6,
  },

  /**
   * External library CDN URLs
   */
  CDN: {
    SUPABASE_JS: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    QRCODE_JS: 'https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js',
    JSQR: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
    HTML2CANVAS: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    JSPDF: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    DOMPURIFY: 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
    CHARTJS: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  },

  /**
   * Admin role permissions map
   */
  ROLE_PERMISSIONS: {
    super_admin: [
      'dashboard', 'opd', 'clinic', 'patients',
      'super', 'kiosk', 'reports', 'audit', 'prescriptions'
    ],
    opd_admin: [
      'dashboard', 'opd', 'patients', 'prescriptions'
    ],
    clinic_admin: [
      'dashboard', 'clinic', 'patients', 'prescriptions'
    ],
    user_creator: [
      'dashboard', 'kiosk'
    ],
  },

  /**
   * Admin role redirect map — where each role lands after login
   */
  ROLE_HOME: {
    super_admin: '/admin/dashboard.html',
    opd_admin: '/admin/opd/bookings.html',
    clinic_admin: '/admin/clinic/bookings.html',
    user_creator: '/admin/kiosk/register.html',
  },

  /**
   * Booking status display configuration
   */
  BOOKING_STATUSES: {
    pending: { label: 'Pending', class: 'badge--pending', color: '#94A3B8' },
    verified: { label: 'Verified', class: 'badge--verified', color: '#3B82F6' },
    in_consultation: { label: 'In Consultation', class: 'badge--consulting', color: '#8B5CF6' },
    completed: { label: 'Completed', class: 'badge--completed', color: '#10B981' },
    cancelled: { label: 'Cancelled', class: 'badge--cancelled', color: '#EF4444' },
    no_show: { label: 'No Show', class: 'badge--noshow', color: '#F59E0B' },
  },
};

// Freeze the config to prevent accidental mutation
Object.freeze(AMH_CONFIG);
Object.freeze(AMH_CONFIG.APP);
Object.freeze(AMH_CONFIG.CDN);
Object.freeze(AMH_CONFIG.ROLE_PERMISSIONS);
Object.freeze(AMH_CONFIG.ROLE_HOME);
Object.freeze(AMH_CONFIG.BOOKING_STATUSES);
