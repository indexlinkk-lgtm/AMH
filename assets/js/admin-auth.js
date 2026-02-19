/**
 * admin-auth.js — Admin Authentication & Role-Based Access Control
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Handles admin login via Supabase Auth (email + password),
 * role detection, session guard, and route permission checks.
 */

'use strict';

/* ============================================================
   BASE PATH HELPER — works with file:// and http://
   ============================================================ */
/**
 * Get the root base path of the project dynamically.
 * Works whether served via file://, localhost, or a live host.
 * Looks for a known root marker file (index.html) by walking up.
 * Simpler approach: detect depth from URL and prefix accordingly.
 */
function getBasePath() {
  const path = window.location.pathname;
  // Count folder depth by counting slashes after the project root
  // We detect depth by path segments
  const segments = path.replace(/\/[^/]*$/, '').split('/').filter(Boolean);

  // Find where 'amh-hospital' or similar root is, then count from there
  // Simplest: count non-empty segments in the directory path
  // Root = 0 depth beyond project, admin/ or patient/ = 1, admin/opd/ = 2
  let depth = 0;
  const knownRoots = ['amh-hospital'];
  let foundRoot = false;
  for (const seg of segments) {
    if (knownRoots.includes(seg)) { foundRoot = true; continue; }
    if (foundRoot) depth++;
  }
  if (!foundRoot) {
    // Fallback: use known page path patterns
    if (path.includes('/admin/opd/') || path.includes('/admin/clinic/') ||
        path.includes('/admin/patients/') || path.includes('/admin/super/')) {
      depth = 2;
    } else if (path.includes('/admin/') || path.includes('/patient/') || path.includes('/kiosk/')) {
      depth = 1;
    }
  }

  return depth === 0 ? '.' : depth === 1 ? '..' : '../..';
}

function adminLoginUrl() { return getBasePath() + '/admin/login.html'; }
function adminDashboardUrl() { return getBasePath() + '/admin/dashboard.html'; }
function adminRoleHomeUrl(role) {
  const base = getBasePath();
  const map = {
    super_admin:  base + '/admin/dashboard.html',
    opd_admin:    base + '/admin/opd/bookings.html',
    clinic_admin: base + '/admin/clinic/bookings.html',
    user_creator: base + '/kiosk/register.html',
  };
  return map[role] || (base + '/admin/dashboard.html');
}

/* ============================================================
   SESSION CONSTANTS
   ============================================================ */
const ADMIN_SESSION_KEY = 'amh_admin_session_data';

/* ============================================================
   ADMIN SESSION MANAGEMENT
   ============================================================ */

/**
 * Store admin session data in sessionStorage.
 * Supabase Auth handles the actual JWT in its own storage.
 * We keep a local copy for UI role checks.
 * @param {Object} adminRecord - Row from admin_users table
 */
function setAdminSession(adminRecord) {
  const session = {
    id: adminRecord.id,
    full_name: adminRecord.full_name,
    email: adminRecord.email,
    role: adminRecord.role,
    is_active: adminRecord.is_active,
    logged_in_at: new Date().toISOString(),
  };
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

/**
 * Get the current admin session from sessionStorage.
 * @returns {Object|null}
 */
function getAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear the admin session.
 */
function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

/**
 * Check if an admin is currently logged in (has local session AND Supabase session).
 * @returns {Promise<boolean>}
 */
async function isAdminLoggedIn() {
  const localSession = getAdminSession();
  if (!localSession) return false;

  try {
    const db = getDB();
    const { data: { session } } = await db.auth.getSession();
    return session !== null;
  } catch {
    return false;
  }
}

/**
 * Route guard for admin pages — redirects to login if not authenticated
 * or if the admin doesn't have permission for the current page.
 * Call at the top of every admin page.
 * @param {string[]} [requiredPermissions] - Permissions needed (from AMH_CONFIG.ROLE_PERMISSIONS)
 * @returns {Promise<Object|null>} Admin session or null
 */
async function requireAdminAuth(requiredPermissions = []) {
  const localSession = getAdminSession();
  if (!localSession) {
    window.location.href = adminLoginUrl();
    return null;
  }

  try {
    const db = getDB();
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
      clearAdminSession();
      window.location.href = adminLoginUrl();
      return null;
    }

    // Verify the admin is still active in the database
    const { data: adminRecord, error } = await getAdminByAuthId(session.user.id);

    if (error || !adminRecord || !adminRecord.is_active) {
      clearAdminSession();
      await db.auth.signOut();
      window.location.href = adminLoginUrl();
      return null;
    }

    // Refresh local session in case role changed
    setAdminSession(adminRecord);

    // Check permission for this page
    if (requiredPermissions.length > 0) {
      const allowedPermissions = AMH_CONFIG.ROLE_PERMISSIONS[adminRecord.role] || [];
      const hasPermission = requiredPermissions.every(perm =>
        allowedPermissions.includes(perm)
      );

      if (!hasPermission) {
        // Redirect to their allowed home
        window.location.href = adminRoleHomeUrl(adminRecord.role);
        return null;
      }
    }

    return adminRecord;
  } catch (err) {
    console.error('Auth check failed:', err.message);
    window.location.href = adminLoginUrl();
    return null;
  }
}

/* ============================================================
   ADMIN LOGIN
   ============================================================ */

/**
 * Handle the admin login form submission.
 * Uses Supabase Auth signInWithPassword.
 * @param {Event} event - Form submit event
 */
async function handleAdminLogin(event) {
  event.preventDefault();

  const form = event.target;
  const emailInput = form.querySelector('#admin-email');
  const passwordInput = form.querySelector('#admin-password');
  const submitBtn = form.querySelector('[type="submit"]');
  const errorDisplay = document.getElementById('admin-login-error');

  clearAllFormErrors(form);
  if (errorDisplay) errorDisplay.style.display = 'none';

  const email = emailInput?.value?.trim() || '';
  const password = passwordInput?.value || '';

  // Client-side validation
  let hasErrors = false;

  if (!validateEmail(email)) {
    showFieldError(emailInput, 'Please enter a valid email address');
    hasErrors = true;
  }

  if (!password || password.length < 6) {
    showFieldError(passwordInput, 'Please enter your password');
    hasErrors = true;
  }

  if (hasErrors) return;

  disableSubmitButton(submitBtn, 'Signing in...');

  try {
    const db = getDB();

    // Step 1: Sign in with Supabase Auth
    const { data: authData, error: authError } = await db.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      if (errorDisplay) {
        errorDisplay.textContent = 'Invalid email or password. Please try again.';
        errorDisplay.style.display = 'flex';
      }
      enableSubmitButton(submitBtn);
      return;
    }

    // Step 2: Fetch admin_users record
    console.log('[AMH] Auth success. UID:', authData.user.id);
    const { data: adminRecord, error: adminError } = await getAdminByAuthId(authData.user.id);
    console.log('[AMH] getAdminByAuthId result:', { adminRecord, adminError });

    if (adminError || !adminRecord) {
      console.error('[AMH] Admin lookup failed:', adminError);
      if (errorDisplay) {
        errorDisplay.querySelector
          ? (errorDisplay.querySelector('#admin-error-text') || errorDisplay).textContent =
              'Admin account not found. UID: ' + authData.user.id
          : null;
        errorDisplay.textContent = 'Admin record not found for UID: ' + authData.user.id + '. Error: ' + (adminError || 'null record');
        errorDisplay.style.display = 'flex';
      }
      await db.auth.signOut();
      enableSubmitButton(submitBtn);
      return;
    }

    // Step 3: Check if account is active
    if (!adminRecord.is_active) {
      if (errorDisplay) {
        errorDisplay.textContent = 'Your account has been disabled. Please contact the super administrator.';
        errorDisplay.style.display = 'flex';
      }
      await db.auth.signOut();
      enableSubmitButton(submitBtn);
      return;
    }

    // Step 4: Store session and update last_login_at
    setAdminSession(adminRecord);

    // Update last login
    const db2 = getDB();
    await db2.from('admin_users').update({
      last_login_at: new Date().toISOString(),
    }).eq('id', adminRecord.id);

    // Log the login
    await writeAuditLog({
      admin_id: adminRecord.id,
      action_type: 'ADMIN_LOGIN',
      details: { email: adminRecord.email, role: adminRecord.role },
    });

    Toast.success('Welcome!', `Logged in as ${adminRecord.full_name}`);

    // Step 5: Redirect to role-appropriate page
    setTimeout(() => {
      window.location.href = adminRoleHomeUrl(adminRecord.role);
    }, 800);

  } catch (err) {
    if (errorDisplay) {
      errorDisplay.textContent = 'Connection error. Please try again.';
      errorDisplay.style.display = 'flex';
    }
    enableSubmitButton(submitBtn);
  }
}

/* ============================================================
   ADMIN LOGOUT
   ============================================================ */

/**
 * Sign out the current admin user.
 * Clears Supabase Auth session and local session storage.
 * @param {boolean} [silent=false] - If true, no toast shown
 */
async function adminLogout(silent = false) {
  const session = getAdminSession();

  // Write audit log before clearing session
  if (session) {
    try {
      await writeAuditLog({
        admin_id: session.id,
        action_type: 'ADMIN_LOGOUT',
        details: { email: session.email },
      });
    } catch {
      // Non-critical, proceed with logout
    }
  }

  clearAdminSession();

  try {
    const db = getDB();
    await db.auth.signOut();
  } catch {
    // Proceed even if signOut fails
  }

  if (!silent) {
    Toast.info('Logged Out', 'You have been signed out successfully.');
  }

  setTimeout(() => {
    window.location.href = adminLoginUrl();
  }, 600);
}

/* ============================================================
   ROLE-BASED UI HELPERS
   ============================================================ */

/**
 * Show/hide elements based on the current admin's role.
 * Elements with data-roles attribute will be shown only if the admin's role matches.
 * Example: <button data-roles="super_admin opd_admin">Action</button>
 * @param {string} adminRole - Current admin role
 */
function applyRoleBasedUI(adminRole) {
  document.querySelectorAll('[data-roles]').forEach(el => {
    const allowedRoles = el.dataset.roles.split(' ');
    if (allowedRoles.includes(adminRole)) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

/**
 * Populate the navbar with admin user info.
 * @param {Object} adminSession
 */
function populateAdminNavbar(adminSession) {
  if (!adminSession) return;

  const nameEl = document.getElementById('admin-nav-name');
  const roleEl = document.getElementById('admin-nav-role');
  const avatarEl = document.getElementById('admin-nav-avatar');

  if (nameEl) nameEl.textContent = adminSession.full_name;
  if (roleEl) {
    roleEl.textContent = getRoleLabel(adminSession.role);
    roleEl.className = `badge ${getRoleBadgeClass(adminSession.role)}`;
  }
  if (avatarEl) {
    avatarEl.textContent = getInitials(adminSession.full_name);
  }

  // Apply role-based element visibility
  applyRoleBasedUI(adminSession.role);

  // Attach logout buttons
  document.querySelectorAll('[data-action="admin-logout"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      adminLogout();
    });
  });
}

/* ============================================================
   CREATE ADMIN USER (Super Admin only)
   ============================================================ */

/**
 * Create a new admin user via Supabase Auth and insert the admin_users record.
 * @param {Object} adminData - { full_name, email, role }
 * @param {string} createdByAdminId - UUID of the super admin creating this account
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function createAdminUser(adminData, createdByAdminId) {
  try {
    const db = getDB();

    // Step 1: Create Supabase Auth user (generates password reset email)
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email: adminData.email,
      email_confirm: true,
      user_metadata: {
        full_name: adminData.full_name,
        role: adminData.role,
      },
    });

    if (authError) {
      // Note: admin.createUser requires service_role key.
      // For anon key usage, use signUp with a temp password instead.
      return { data: null, error: authError.message };
    }

    // Step 2: Insert admin_users record
    const { data, error } = await insertAdminRecord({
      id: authData.user.id,
      full_name: adminData.full_name,
      email: adminData.email,
      role: adminData.role,
      created_by: createdByAdminId,
    });

    if (error) return { data: null, error };
    return { data, error: null };

  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Create admin using signUp (for anon key deployments).
 * The user will receive an email to set their password.
 * @param {Object} adminData - { full_name, email, role, tempPassword }
 * @param {string} createdByAdminId
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
async function createAdminUserWithSignUp(adminData, createdByAdminId) {
  try {
    const db = getDB();

    // Generate a temporary password
    const tempPassword = 'AMH' + Math.random().toString(36).slice(2, 10).toUpperCase() + '!';

    const { data: authData, error: authError } = await db.auth.signUp({
      email: adminData.email,
      password: tempPassword,
      options: {
        data: {
          full_name: adminData.full_name,
          role: adminData.role,
        },
        emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/\/[^/]*\/[^/]*$/, '')}/admin/login.html`,
      },
    });

    if (authError) {
      return { data: null, error: authError.message };
    }

    if (!authData.user) {
      return { data: null, error: 'User creation failed. Email may already be in use.' };
    }

    // Insert admin_users record
    const { data, error } = await insertAdminRecord({
      id: authData.user.id,
      full_name: adminData.full_name,
      email: adminData.email,
      role: adminData.role,
      created_by: createdByAdminId,
    });

    if (error) return { data: null, error };
    return { data, error: null };

  } catch (err) {
    return { data: null, error: err.message };
  }
}

/* ============================================================
   ADMIN NAVBAR MOBILE TOGGLE
   ============================================================ */

/**
 * Initialize the mobile hamburger menu for admin navbar.
 */
function initAdminNavbarMobile() {
  const toggle = document.getElementById('navbar-menu-toggle');
  const mobileNav = document.getElementById('navbar-mobile-nav');

  if (!toggle || !mobileNav) return;

  toggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen);
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  // Close on outside click
  document.addEventListener('click', (event) => {
    if (!toggle.contains(event.target) && !mobileNav.contains(event.target)) {
      mobileNav.classList.remove('is-open');
    }
  });
}

/* ============================================================
   INITIALIZE ON PAGE LOAD
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Admin login form
  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', handleAdminLogin);

    // Check if already logged in
    (async () => {
      const loggedIn = await isAdminLoggedIn();
      if (loggedIn) {
        const session = getAdminSession();
        window.location.href = session
          ? adminRoleHomeUrl(session.role)
          : adminDashboardUrl();
      }
    })();
  }

  // Initialize mobile navbar if present
  initAdminNavbarMobile();
});

