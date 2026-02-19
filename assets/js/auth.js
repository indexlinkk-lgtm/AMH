/**
 * auth.js — Patient Authentication & Session Management
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Handles patient login (ID + NIC last 4), registration,
 * session storage, inactivity detection, and auto-logout.
 */

'use strict';

/* ============================================================
   BASE PATH HELPER — works with file:// and http://
   ============================================================ */
function getPatientBasePath() {
  const path = window.location.pathname;
  if (path.includes('/patient/') || path.includes('/admin/') || path.includes('/kiosk/')) {
    return '..';
  }
  if (path.includes('/admin/opd/') || path.includes('/admin/clinic/') ||
      path.includes('/admin/patients/') || path.includes('/admin/super/')) {
    return '../..';
  }
  return '.';
}

function indexUrl()           { return getPatientBasePath() + '/index.html'; }
function patientDashUrl()     { return getPatientBasePath() + '/patient/dashboard.html'; }

/* ============================================================
   SESSION CONSTANTS
   ============================================================ */
const PATIENT_SESSION_KEY = 'amh_patient_session';
const INACTIVITY_TIMER_KEY = 'amh_last_activity';

/* ============================================================
   SESSION MANAGEMENT
   ============================================================ */

/**
 * Store a patient session in sessionStorage.
 * Uses sessionStorage (not localStorage) so session clears on tab close.
 * @param {Object} patient - Patient record from the database
 */
function setPatientSession(patient) {
  const session = {
    id: patient.id,
    unique_patient_id: patient.unique_patient_id,
    full_name: patient.full_name,
    age: patient.age,
    gender: patient.gender,
    address: patient.address,
    nic_number: patient.nic_number,
    phone_number: patient.phone_number,
    guardian_name: patient.guardian_name,
    guardian_phone: patient.guardian_phone,
    created_at: patient.created_at,
    logged_in_at: new Date().toISOString(),
  };
  sessionStorage.setItem(PATIENT_SESSION_KEY, JSON.stringify(session));
  updateLastActivity();
}

/**
 * Get the current patient session from sessionStorage.
 * @returns {Object|null} Patient session or null if not logged in
 */
function getPatientSession() {
  try {
    const raw = sessionStorage.getItem(PATIENT_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear the patient session (logout).
 */
function clearPatientSession() {
  sessionStorage.removeItem(PATIENT_SESSION_KEY);
  sessionStorage.removeItem(INACTIVITY_TIMER_KEY);
}

/**
 * Check if a patient is currently logged in.
 * @returns {boolean}
 */
function isPatientLoggedIn() {
  return getPatientSession() !== null;
}

/**
 * Route guard — redirect to login if not authenticated.
 * Call at the top of every patient page.
 * @param {string} [redirectTo] - Override redirect URL
 */
function requirePatientAuth(redirectTo = null) {
  if (!redirectTo) redirectTo = indexUrl();
  const session = getPatientSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

/* ============================================================
   INACTIVITY AUTO-LOGOUT
   ============================================================ */

let inactivityTimer = null;
let warningTimer = null;
let warningModalShown = false;

/**
 * Update the last activity timestamp.
 * Called on every user interaction event.
 */
function updateLastActivity() {
  sessionStorage.setItem(INACTIVITY_TIMER_KEY, Date.now().toString());
}

/**
 * Start the inactivity detection system.
 * Monitors mouse, keyboard, touch, and click events.
 * Shows a 60-second warning before auto-logout.
 * Call once on patient page load.
 */
function startInactivityDetection() {
  const timeoutMs = AMH_CONFIG.APP.SESSION_TIMEOUT_MS;       // 15 min
  const warningMs = AMH_CONFIG.APP.SESSION_WARNING_MS;        // 14 min
  const warningDurationMs = AMH_CONFIG.APP.SESSION_WARNING_DURATION_MS; // 60 sec

  const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];

  /**
   * Reset all timers and dismiss warning when user is active.
   */
  function resetTimers() {
    updateLastActivity();
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);

    // Dismiss warning if shown
    if (warningModalShown) {
      dismissWarningModal();
    }

    // Warning timer — fires at 14 minutes
    warningTimer = setTimeout(() => {
      if (!warningModalShown) {
        showInactivityWarning(warningDurationMs);
      }
    }, warningMs);

    // Logout timer — fires at 15 minutes
    inactivityTimer = setTimeout(() => {
      performAutoLogout();
    }, timeoutMs);
  }

  // Attach activity listeners
  activityEvents.forEach(event => {
    document.addEventListener(event, resetTimers, { passive: true });
  });

  // Start timers immediately
  resetTimers();
}

/**
 * Stop the inactivity detection (e.g., on manual logout).
 */
function stopInactivityDetection() {
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);
}

/**
 * Show the 60-second auto-logout warning modal.
 * @param {number} warningDurationMs - Duration of warning in milliseconds
 */
function showInactivityWarning(warningDurationMs) {
  warningModalShown = true;

  let secondsLeft = Math.round(warningDurationMs / 1000);

  const backdrop = document.createElement('div');
  backdrop.id = 'inactivity-warning-backdrop';
  backdrop.className = 'modal-backdrop';
  backdrop.style.display = 'flex';
  backdrop.style.zIndex = '9999';

  backdrop.innerHTML = `
    <div class="modal modal--sm" data-confirm-only="true">
      <div class="modal__header" style="background: var(--color-warning-light); border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;">
        <div>
          <div class="modal__title" style="color: var(--color-warning-dark);">⚠️ Session Expiring Soon</div>
          <div class="modal__subtitle" style="color: var(--color-warning-dark); opacity: 0.8;">Are you still there?</div>
        </div>
      </div>
      <div class="modal__body session-warning-modal" style="text-align: center; padding: var(--space-8);">
        <div class="session-warning-modal__icon">⏳</div>
        <p style="color: var(--color-text-secondary); margin-bottom: var(--space-3);">
          You will be automatically logged out in
        </p>
        <div class="session-warning-modal__countdown" id="warning-countdown">${secondsLeft}</div>
        <p style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
          seconds due to inactivity.
        </p>
      </div>
      <div class="modal__footer" style="justify-content: center;">
        <button class="btn btn--primary btn--lg" id="stay-logged-in-btn" type="button">
          I'm Still Here — Stay Logged In
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  // Countdown display
  const countdownEl = backdrop.querySelector('#warning-countdown');
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (countdownEl) countdownEl.textContent = secondsLeft;
    if (secondsLeft <= 0) clearInterval(countdownInterval);
  }, 1000);

  // Stay logged in button
  backdrop.querySelector('#stay-logged-in-btn').addEventListener('click', () => {
    clearInterval(countdownInterval);
    dismissWarningModal();
    updateLastActivity();
  });

  // Store interval for cleanup
  backdrop.dataset.interval = countdownInterval;
}

/**
 * Dismiss the inactivity warning modal.
 */
function dismissWarningModal() {
  warningModalShown = false;
  const backdrop = document.getElementById('inactivity-warning-backdrop');
  if (backdrop) {
    const interval = backdrop.dataset.interval;
    if (interval) clearInterval(parseInt(interval, 10));
    backdrop.remove();
    document.body.style.overflow = '';
  }
}

/**
 * Perform automatic logout due to inactivity.
 * Clears session and redirects to login page.
 */
function performAutoLogout() {
  stopInactivityDetection();
  dismissWarningModal();
  clearPatientSession();
  // Show brief logout notice before redirect
  sessionStorage.setItem('amh_logout_reason', 'inactivity');
  window.location.href = indexUrl();
}

/**
 * Perform manual patient logout.
 */
function patientLogout() {
  stopInactivityDetection();
  clearPatientSession();
  window.location.href = indexUrl();
}

/* ============================================================
   PATIENT LOGIN FORM HANDLER
   ============================================================ */

/**
 * Handle the patient login form submission.
 * Validates input, authenticates against Supabase, sets session.
 * @param {Event} event - Form submit event
 */
async function handlePatientLogin(event) {
  event.preventDefault();

  const form = event.target;
  const patientIdInput = form.querySelector('#patient-id-input');
  const nicLast4Input = form.querySelector('#nic-last4-input');
  const submitBtn = form.querySelector('[type="submit"]');

  // Clear previous errors
  clearAllFormErrors(form);

  const patientId = patientIdInput?.value?.trim().toUpperCase() || '';
  const nicLast4 = nicLast4Input?.value?.trim() || '';

  // Client-side validation
  let hasErrors = false;

  if (!patientId || patientId.length < 10) {
    showFieldError(patientIdInput, 'Please enter a valid Patient ID (e.g. AMH2026000123)');
    hasErrors = true;
  }

  if (!nicLast4 || nicLast4.length !== 4) {
    showFieldError(nicLast4Input, 'Please enter the last 4 characters of your NIC');
    hasErrors = true;
  }

  if (hasErrors) return;

  // Disable button during request
  disableSubmitButton(submitBtn, 'Verifying...');

  try {
    const { data: patient, error } = await authenticatePatient(patientId, nicLast4);

    if (error || !patient) {
      Toast.error('Login Failed', error || 'Patient not found. Please check your details.');
      enableSubmitButton(submitBtn);
      return;
    }

    // Set session and redirect
    setPatientSession(patient);
    Toast.success('Welcome back!', `Hello, ${patient.full_name}`);

    // Small delay for toast visibility
    setTimeout(() => {
      window.location.href = patientDashUrl();
    }, 800);

  } catch (err) {
    Toast.error('Connection Error', 'Could not connect to the server. Please try again.');
    enableSubmitButton(submitBtn);
  }
}

/* ============================================================
   PATIENT REGISTRATION FORM HANDLER
   ============================================================ */

/**
 * Handle the patient registration form submission.
 * Validates all fields, checks uniqueness, registers the patient.
 * @param {Event} event - Form submit event
 */
async function handlePatientRegistration(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = form.querySelector('[type="submit"]');

  clearAllFormErrors(form);

  // Collect form values
  const fullName = form.querySelector('#reg-full-name')?.value?.trim() || '';
  const ageStr = form.querySelector('#reg-age')?.value?.trim() || '';
  const gender = form.querySelector('#reg-gender')?.value || '';
  const address = form.querySelector('#reg-address')?.value?.trim() || '';
  const nicNumber = form.querySelector('#reg-nic')?.value?.trim() || '';
  const phoneNumber = form.querySelector('#reg-phone')?.value?.trim() || '';
  const guardianName = form.querySelector('#reg-guardian-name')?.value?.trim() || '';
  const guardianPhone = form.querySelector('#reg-guardian-phone')?.value?.trim() || '';

  const age = parseInt(ageStr, 10);

  // Validate all fields
  let hasErrors = false;

  if (!validateName(fullName)) {
    showFieldError(form.querySelector('#reg-full-name'), 'Name must be 3–100 letters and spaces only');
    hasErrors = true;
  }

  if (!validateAge(age)) {
    showFieldError(form.querySelector('#reg-age'), 'Age must be between 1 and 120');
    hasErrors = true;
  }

  if (!gender) {
    showFieldError(form.querySelector('#reg-gender'), 'Please select your gender');
    hasErrors = true;
  }

  if (!validateAddress(address)) {
    showFieldError(form.querySelector('#reg-address'), 'Address must be at least 10 characters');
    hasErrors = true;
  }

  if (!validateNIC(nicNumber)) {
    showFieldError(form.querySelector('#reg-nic'), 'Enter a valid NIC (e.g. 901234567V or 200012345678)');
    hasErrors = true;
  }

  if (!validatePhone(phoneNumber)) {
    showFieldError(form.querySelector('#reg-phone'), 'Enter a valid Sri Lanka phone (+94xxxxxxxxx or 07xxxxxxxx)');
    hasErrors = true;
  }

  // Guardian fields required if age < 18
  if (age < 18) {
    if (!validateName(guardianName)) {
      showFieldError(form.querySelector('#reg-guardian-name'), 'Guardian name is required for patients under 18');
      hasErrors = true;
    }
    if (!validatePhone(guardianPhone)) {
      showFieldError(form.querySelector('#reg-guardian-phone'), 'Valid guardian phone is required for patients under 18');
      hasErrors = true;
    }
  }

  if (hasErrors) return;

  disableSubmitButton(submitBtn, 'Registering...');

  try {
    // Check NIC uniqueness
    const nicTaken = await isNICTaken(nicNumber);
    if (nicTaken) {
      showFieldError(form.querySelector('#reg-nic'), 'This NIC is already registered. Please log in instead.');
      enableSubmitButton(submitBtn);
      return;
    }

    // Check phone uniqueness
    const phoneTaken = await isPhoneTaken(phoneNumber);
    if (phoneTaken) {
      showFieldError(form.querySelector('#reg-phone'), 'This phone number is already registered.');
      enableSubmitButton(submitBtn);
      return;
    }

    // Register the patient
    const patientData = {
      full_name: fullName,
      age,
      gender,
      address,
      nic_number: nicNumber,
      phone_number: phoneNumber,
      guardian_name: age < 18 ? guardianName : null,
      guardian_phone: age < 18 ? guardianPhone : null,
    };

    const { data: patient, error } = await registerPatient(patientData);

    if (error || !patient) {
      Toast.error('Registration Failed', error || 'Could not register. Please try again.');
      enableSubmitButton(submitBtn);
      return;
    }

    // Auto-login after registration
    setPatientSession(patient);
    sessionStorage.setItem('amh_new_registration', 'true');
    sessionStorage.setItem('amh_new_patient_id', patient.unique_patient_id);

    Toast.success('Registration Successful!', `Welcome, ${patient.full_name}! Your ID: ${patient.unique_patient_id}`);

    setTimeout(() => {
      window.location.href = patientDashUrl();
    }, 1200);

  } catch (err) {
    Toast.error('Connection Error', 'Could not connect to the server. Please try again.');
    enableSubmitButton(submitBtn);
  }
}

/* ============================================================
   GUARDIAN FIELD TOGGLE (Age < 18)
   ============================================================ */

/**
 * Show/hide guardian fields based on the entered age.
 * @param {HTMLInputElement} ageInput
 */
function handleAgeChange(ageInput) {
  const guardianSection = document.getElementById('guardian-fields');
  if (!guardianSection) return;

  const age = parseInt(ageInput.value, 10);
  const isMinor = !isNaN(age) && age < 18;

  guardianSection.style.display = isMinor ? 'block' : 'none';

  // Toggle required attribute
  const guardianNameInput = document.getElementById('reg-guardian-name');
  const guardianPhoneInput = document.getElementById('reg-guardian-phone');

  if (guardianNameInput) guardianNameInput.required = isMinor;
  if (guardianPhoneInput) guardianPhoneInput.required = isMinor;
}

/* ============================================================
   LOGOUT NOTICE
   ============================================================ */

/**
 * Check if user was auto-logged-out due to inactivity and show notice.
 * Call on the login page.
 */
function checkLogoutReason() {
  const reason = sessionStorage.getItem('amh_logout_reason');
  if (reason === 'inactivity') {
    sessionStorage.removeItem('amh_logout_reason');
    setTimeout(() => {
      Toast.warning(
        'Session Expired',
        'You were automatically logged out due to 15 minutes of inactivity.',
        6000
      );
    }, 500);
  }
}

/* ============================================================
   LANDING PAGE TAB SWITCHER
   ============================================================ */

/**
 * Initialize the login/register tab switcher on the landing page.
 */
function initLandingTabs() {
  const loginTab = document.getElementById('tab-login');
  const registerTab = document.getElementById('tab-register');
  const loginPanel = document.getElementById('panel-login');
  const registerPanel = document.getElementById('panel-register');

  if (!loginTab || !registerTab) return;

  loginTab.addEventListener('click', () => {
    loginTab.classList.add('landing-card__tab--active');
    registerTab.classList.remove('landing-card__tab--active');
    if (loginPanel) loginPanel.style.display = 'block';
    if (registerPanel) registerPanel.style.display = 'none';
  });

  registerTab.addEventListener('click', () => {
    registerTab.classList.add('landing-card__tab--active');
    loginTab.classList.remove('landing-card__tab--active');
    if (registerPanel) registerPanel.style.display = 'block';
    if (loginPanel) loginPanel.style.display = 'none';
  });

  // Check URL hash for direct tab
  if (window.location.hash === '#register') {
    registerTab.click();
  }
}

/* ============================================================
   INITIALIZE ON PAGE LOAD
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize tabs if on landing page
  initLandingTabs();

  // Login form
  const loginForm = document.getElementById('patient-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handlePatientLogin);
  }

  // Registration form
  const regForm = document.getElementById('patient-registration-form');
  if (regForm) {
    regForm.addEventListener('submit', handlePatientRegistration);

    // Age change listener for guardian fields
    const ageInput = document.getElementById('reg-age');
    if (ageInput) {
      ageInput.addEventListener('input', () => handleAgeChange(ageInput));
      ageInput.addEventListener('change', () => handleAgeChange(ageInput));
    }
  }

  // Check for inactivity logout message
  checkLogoutReason();

  // If already logged in, redirect to dashboard
  if (
    (loginForm || regForm) &&
    isPatientLoggedIn() &&
    !window.location.pathname.includes('dashboard')
  ) {
    window.location.href = patientDashUrl();
  }
});
