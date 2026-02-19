/**
 * utils.js — Utility Functions
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Provides: date/time formatting (Asia/Colombo), input validators,
 * toast notifications, sanitization helpers, and misc utilities.
 */

'use strict';

/* ============================================================
   DATE & TIME — ASIA/COLOMBO (UTC+5:30) HELPERS
   ============================================================ */

/**
 * Get the current date/time in Asia/Colombo timezone.
 * Returns a Date object adjusted to the Sri Lanka offset.
 * @returns {Date} Current Sri Lanka date/time
 */
function getColomboNow() {
  const now = new Date();
  // Asia/Colombo is UTC+5:30 = 330 minutes
  const colomboOffset = 330;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + colomboOffset * 60000);
}

/**
 * Format a UTC timestamp string into a human-readable date
 * displayed in Asia/Colombo timezone.
 * @param {string|Date} timestamp - UTC timestamp or Date object
 * @param {Object} [options] - Intl.DateTimeFormat options override
 * @returns {string} Formatted date string
 */
function formatDate(timestamp, options = {}) {
  if (!timestamp) return '—';
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const defaultOptions = {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  return new Intl.DateTimeFormat('en-LK', { ...defaultOptions, ...options }).format(date);
}

/**
 * Format a UTC timestamp into a full date + time string in Colombo TZ.
 * @param {string|Date} timestamp
 * @returns {string} e.g. "15 Jan 2026, 10:30 AM"
 */
function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return new Intl.DateTimeFormat('en-LK', {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format a time string (HH:MM:SS or HH:MM) to 12-hour display.
 * @param {string} timeStr - e.g. "08:00:00" or "08:00"
 * @returns {string} e.g. "8:00 AM"
 */
function formatTime(timeStr) {
  if (!timeStr) return '—';
  // Parse HH:MM from string
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const min = minStr || '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${min} ${ampm}`;
}

/**
 * Format a time range from two time strings.
 * @param {string} startTime - e.g. "08:00:00"
 * @param {string} endTime - e.g. "09:00:00"
 * @returns {string} e.g. "8:00 AM – 9:00 AM"
 */
function formatTimeRange(startTime, endTime) {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

/**
 * Get a DATE string (YYYY-MM-DD) in Asia/Colombo timezone for a given Date.
 * @param {Date} [date] - Defaults to current Colombo date
 * @returns {string} "YYYY-MM-DD"
 */
function getColomboDateString(date) {
  const d = date || getColomboNow();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a YYYY-MM-DD string to a Date object (treated as local midnight).
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Date}
 */
function parseDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get the number of days between two Date objects (ignoring time).
 * @param {Date} from
 * @param {Date} to
 * @returns {number} Days difference (positive if to > from)
 */
function daysBetween(from, to) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMidnight - fromMidnight) / msPerDay);
}

/**
 * Add a number of days to a Date and return a new Date.
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if a given YYYY-MM-DD date string is in the past
 * relative to Colombo today.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isDateInPast(dateStr) {
  const today = getColomboDateString();
  return dateStr < today;
}

/**
 * Format time remaining as "Xd Xh Xm Xs".
 * @param {number} totalSeconds - Seconds remaining (non-negative)
 * @returns {Object} { days, hours, minutes, seconds }
 */
function parseCountdown(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  return { days, hours, minutes, seconds };
}

/**
 * Get seconds until a future booking datetime (Colombo context).
 * @param {string} bookingDate - "YYYY-MM-DD"
 * @param {string} startTime - "HH:MM:SS"
 * @returns {number} Seconds remaining (may be negative if in past)
 */
function secondsUntilBooking(bookingDate, startTime) {
  const [year, month, day] = bookingDate.split('-').map(Number);
  const [hour, min] = startTime.split(':').map(Number);

  // Build the booking time as a UTC Date (Colombo = UTC+5:30)
  // Colombo offset: 330 minutes
  const bookingUTC = Date.UTC(year, month - 1, day, hour, min, 0) - 330 * 60 * 1000;
  const nowUTC = Date.now();
  return (bookingUTC - nowUTC) / 1000;
}

/* ============================================================
   INPUT VALIDATORS
   ============================================================ */

/**
 * Validate Sri Lanka NIC number.
 * Accepts: 9 digits + V/X (old format) OR 12 digits (new format)
 * @param {string} nic
 * @returns {boolean}
 */
function validateNIC(nic) {
  if (!nic || typeof nic !== 'string') return false;
  const cleaned = nic.trim().toUpperCase();
  return /^[0-9]{9}[VX]$/.test(cleaned) || /^[0-9]{12}$/.test(cleaned);
}

/**
 * Validate Sri Lanka phone number.
 * Accepts: +94xxxxxxxxx or 0xxxxxxxxx (9 digits after prefix)
 * @param {string} phone
 * @returns {boolean}
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.trim();
  return /^(\+94|0)[0-9]{9}$/.test(cleaned);
}

/**
 * Validate full name — letters and spaces only, min 3 chars, max 100.
 * @param {string} name
 * @returns {boolean}
 */
function validateName(name) {
  if (!name || typeof name !== 'string') return false;
  const cleaned = name.trim();
  return /^[a-zA-Z\s]{3,100}$/.test(cleaned);
}

/**
 * Validate age — integer between 1 and 120.
 * @param {number|string} age
 * @returns {boolean}
 */
function validateAge(age) {
  const n = parseInt(age, 10);
  return !isNaN(n) && n >= 1 && n <= 120;
}

/**
 * Validate address — minimum 10 characters.
 * @param {string} address
 * @returns {boolean}
 */
function validateAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return address.trim().length >= 10;
}

/**
 * Validate time slot — end time must be after start time.
 * @param {string} startTime - "HH:MM"
 * @param {string} endTime - "HH:MM"
 * @returns {boolean}
 */
function validateTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return false;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  return endMinutes > startMinutes;
}

/**
 * Validate max slots — integer between 1 and 500.
 * @param {number|string} slots
 * @returns {boolean}
 */
function validateMaxSlots(slots) {
  const n = parseInt(slots, 10);
  return !isNaN(n) && n >= 1 && n <= 500;
}

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate a date is today or in the future.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {boolean}
 */
function validateFutureDate(dateStr) {
  const today = getColomboDateString();
  return dateStr >= today;
}

/**
 * Normalize NIC to uppercase (for display consistency).
 * @param {string} nic
 * @returns {string}
 */
function normalizeNIC(nic) {
  return nic ? nic.trim().toUpperCase() : '';
}

/**
 * Normalize phone to standard +94 format for storage.
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (cleaned.startsWith('0')) {
    return '+94' + cleaned.slice(1);
  }
  return cleaned;
}

/* ============================================================
   TEXT SANITIZATION (XSS Prevention)
   ============================================================ */

/**
 * Sanitize a string for safe textContent insertion.
 * Strips all HTML tags by relying on the browser's text parser.
 * @param {string} str
 * @returns {string} Sanitized string safe for textContent
 */
function sanitizeText(str) {
  if (!str && str !== 0) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.textContent;
}

/**
 * Sanitize HTML using DOMPurify if available, else strip all tags.
 * Only use this when HTML rendering is truly necessary.
 * @param {string} html
 * @returns {string} Sanitized HTML
 */
function sanitizeHTML(html) {
  if (!html) return '';
  if (window.DOMPurify) {
    return window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
      ALLOWED_ATTR: [],
    });
  }
  // Fallback: strip all tags
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/**
 * Set an element's text safely using textContent.
 * @param {HTMLElement} element
 * @param {string} text
 */
function setTextSafe(element, text) {
  if (element) element.textContent = sanitizeText(text);
}

/* ============================================================
   TOAST NOTIFICATION SYSTEM
   ============================================================ */

let toastContainer = null;

/**
 * Initialize the toast container element (creates it if needed).
 * @returns {HTMLElement} Toast container
 */
function getToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a toast notification.
 * @param {Object} options
 * @param {string} options.type - 'success' | 'error' | 'warning' | 'info'
 * @param {string} options.title - Bold heading text
 * @param {string} [options.message] - Optional body text
 * @param {number} [options.duration] - Auto-dismiss ms (default 4000, 0 = no auto-dismiss)
 * @returns {HTMLElement} The created toast element
 */
function showToast({ type = 'info', title, message = '', duration }) {
  const container = getToastContainer();
  const dismissDuration = duration !== undefined ? duration : (AMH_CONFIG?.APP?.TOAST_DURATION_MS || 4000);

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${icons[type] || 'ℹ️'}</span>
    <div class="toast__content">
      <div class="toast__title"></div>
      ${message ? '<div class="toast__message"></div>' : ''}
    </div>
    <button class="toast__close" aria-label="Dismiss notification">✕</button>
    ${dismissDuration > 0 ? `<div class="toast__progress" style="animation-duration: ${dismissDuration}ms"></div>` : ''}
  `;

  // Set text safely
  toast.querySelector('.toast__title').textContent = title;
  if (message) {
    toast.querySelector('.toast__message').textContent = message;
  }

  // Close button handler
  const closeBtn = toast.querySelector('.toast__close');
  closeBtn.addEventListener('click', () => dismissToast(toast));

  container.appendChild(toast);

  // Auto-dismiss
  if (dismissDuration > 0) {
    setTimeout(() => dismissToast(toast), dismissDuration);
  }

  return toast;
}

/**
 * Dismiss a specific toast with exit animation.
 * @param {HTMLElement} toast
 */
function dismissToast(toast) {
  if (!toast || toast.classList.contains('toast--exiting')) return;
  toast.classList.add('toast--exiting');
  toast.addEventListener('animationend', () => {
    toast.remove();
  }, { once: true });
  // Fallback remove
  setTimeout(() => toast.remove(), 300);
}

/**
 * Convenience wrappers
 */
const Toast = {
  success: (title, message, duration) => showToast({ type: 'success', title, message, duration }),
  error: (title, message, duration) => showToast({ type: 'error', title, message, duration }),
  warning: (title, message, duration) => showToast({ type: 'warning', title, message, duration }),
  info: (title, message, duration) => showToast({ type: 'info', title, message, duration }),
};

/* ============================================================
   MODAL SYSTEM
   ============================================================ */

/**
 * Open a modal by its ID or element reference.
 * @param {string|HTMLElement} modalIdOrElement
 */
function openModal(modalIdOrElement) {
  const modal = typeof modalIdOrElement === 'string'
    ? document.getElementById(modalIdOrElement)
    : modalIdOrElement;
  if (!modal) return;

  const backdrop = modal.closest('.modal-backdrop') || modal;

  if (backdrop.classList.contains('modal-backdrop')) {
    backdrop.style.display = 'flex';
    backdrop.classList.remove('is-closing');
    document.body.style.overflow = 'hidden';

    // Close on backdrop click (not on modal itself)
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        const innerModal = backdrop.querySelector('.modal');
        if (innerModal && !innerModal.dataset.confirmOnly) {
          closeModal(backdrop);
        }
      }
    }, { once: true });
  }
}

/**
 * Close a modal with animation.
 * @param {string|HTMLElement} modalIdOrElement
 */
function closeModal(modalIdOrElement) {
  const modal = typeof modalIdOrElement === 'string'
    ? document.getElementById(modalIdOrElement)
    : modalIdOrElement;
  if (!modal) return;

  const backdrop = modal.closest('.modal-backdrop') || modal;
  const innerModal = backdrop.querySelector('.modal');

  if (innerModal) innerModal.classList.add('is-closing');
  backdrop.classList.add('is-closing');

  setTimeout(() => {
    backdrop.style.display = 'none';
    if (innerModal) innerModal.classList.remove('is-closing');
    backdrop.classList.remove('is-closing');
    document.body.style.overflow = '';
  }, 250);
}

/**
 * Create and show a confirmation modal.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmLabel] - Default "Confirm"
 * @param {string} [options.cancelLabel] - Default "Cancel"
 * @param {string} [options.confirmClass] - Default "btn--danger"
 * @param {Function} options.onConfirm - Called when confirmed
 * @param {Function} [options.onCancel] - Called when cancelled
 * @returns {HTMLElement} Backdrop element
 */
function showConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmClass = 'btn--danger',
  onConfirm,
  onCancel,
}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.display = 'flex';

  const modal = document.createElement('div');
  modal.className = 'modal modal--sm modal--confirm';
  modal.dataset.confirmOnly = 'true';
  modal.innerHTML = `
    <div class="modal__header">
      <div>
        <div class="modal__title"></div>
      </div>
    </div>
    <div class="modal__body">
      <p class="modal__message" style="color: var(--color-text-secondary); line-height: 1.6;"></p>
    </div>
    <div class="modal__footer">
      <button class="btn btn--ghost cancel-btn" type="button"></button>
      <button class="btn ${confirmClass} confirm-btn" type="button"></button>
    </div>
  `;

  modal.querySelector('.modal__title').textContent = title;
  modal.querySelector('.modal__message').textContent = message;
  modal.querySelector('.cancel-btn').textContent = cancelLabel;
  modal.querySelector('.confirm-btn').textContent = confirmLabel;

  modal.querySelector('.cancel-btn').addEventListener('click', () => {
    backdrop.remove();
    document.body.style.overflow = '';
    if (onCancel) onCancel();
  });

  modal.querySelector('.confirm-btn').addEventListener('click', () => {
    backdrop.remove();
    document.body.style.overflow = '';
    if (onConfirm) onConfirm();
  });

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  return backdrop;
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */

/**
 * Set up Escape key to close the topmost open modal.
 * Call once on page load.
 */
function setupEscapeKey() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const openBackdrops = document.querySelectorAll(
        '.modal-backdrop[style*="flex"]'
      );
      if (openBackdrops.length > 0) {
        const topBackdrop = openBackdrops[openBackdrops.length - 1];
        const innerModal = topBackdrop.querySelector('.modal');
        if (!innerModal || !innerModal.dataset.confirmOnly) {
          closeModal(topBackdrop);
        }
      }
    }
  });
}

/* ============================================================
   SPINNER / LOADING OVERLAY
   ============================================================ */

let spinnerOverlay = null;

/**
 * Show a full-screen loading spinner.
 * @param {string} [message] - Optional message to show
 */
function showSpinner(message) {
  if (!spinnerOverlay) {
    spinnerOverlay = document.createElement('div');
    spinnerOverlay.className = 'spinner-overlay';
    spinnerOverlay.setAttribute('role', 'status');
    spinnerOverlay.setAttribute('aria-label', 'Loading');
    spinnerOverlay.innerHTML = `
      <div style="text-align: center;">
        <div class="spinner"></div>
        ${message ? `<p class="spinner-message" style="color:white; margin-top:16px; font-size:14px;"></p>` : ''}
      </div>
    `;
    document.body.appendChild(spinnerOverlay);
  }
  if (message) {
    const msgEl = spinnerOverlay.querySelector('.spinner-message');
    if (msgEl) msgEl.textContent = message;
  }
  spinnerOverlay.style.display = 'flex';
}

/**
 * Hide the full-screen loading spinner.
 */
function hideSpinner() {
  if (spinnerOverlay) {
    spinnerOverlay.style.display = 'none';
  }
}

/* ============================================================
   FORM HELPERS
   ============================================================ */

/**
 * Collect all form field values into a plain object.
 * Keys are the input name attributes.
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
function getFormData(form) {
  const data = {};
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }
  return data;
}

/**
 * Show validation error on a form field.
 * @param {HTMLElement} inputEl - The input element
 * @param {string} message - Error message
 */
function showFieldError(inputEl, message) {
  if (!inputEl) return;
  inputEl.classList.add('form-input--error');
  inputEl.setAttribute('aria-invalid', 'true');

  // Remove existing error message if any
  const existingError = inputEl.parentElement.querySelector('.form-error');
  if (existingError) existingError.remove();

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.textContent = message;
  inputEl.parentElement.appendChild(errorEl);
}

/**
 * Clear validation error on a form field.
 * @param {HTMLElement} inputEl
 */
function clearFieldError(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove('form-input--error');
  inputEl.removeAttribute('aria-invalid');
  const errorEl = inputEl.parentElement.querySelector('.form-error');
  if (errorEl) errorEl.remove();
}

/**
 * Clear all validation errors in a form.
 * @param {HTMLFormElement} form
 */
function clearAllFormErrors(form) {
  form.querySelectorAll('.form-input--error, .form-select--error, .form-textarea--error').forEach(el => {
    el.classList.remove('form-input--error', 'form-select--error', 'form-textarea--error');
    el.removeAttribute('aria-invalid');
  });
  form.querySelectorAll('.form-error').forEach(el => el.remove());
}

/**
 * Disable a submit button and store original text.
 * @param {HTMLButtonElement} btn
 * @param {string} [loadingText]
 */
function disableSubmitButton(btn, loadingText = 'Processing...') {
  if (!btn) return;
  btn.dataset.originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('btn--loading');
  btn.textContent = loadingText;
}

/**
 * Re-enable a submit button and restore original text.
 * @param {HTMLButtonElement} btn
 */
function enableSubmitButton(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.classList.remove('btn--loading');
  if (btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
    delete btn.dataset.originalText;
  }
}

/* ============================================================
   BADGE HELPERS
   ============================================================ */

/**
 * Create a status badge element.
 * @param {string} status - Booking status string
 * @returns {HTMLElement}
 */
function createStatusBadge(status) {
  const statusConfig = AMH_CONFIG?.BOOKING_STATUSES?.[status] || {
    label: status,
    class: 'badge--pending',
  };
  const badge = document.createElement('span');
  badge.className = `badge ${statusConfig.class}`;
  badge.textContent = statusConfig.label;
  return badge;
}

/**
 * Get the role badge CSS class.
 * @param {string} role
 * @returns {string} CSS class name
 */
function getRoleBadgeClass(role) {
  const map = {
    super_admin: 'badge--super-admin',
    opd_admin: 'badge--opd-admin',
    clinic_admin: 'badge--clinic-admin',
    user_creator: 'badge--user-creator',
  };
  return map[role] || 'badge--pending';
}

/**
 * Get a human-readable role label.
 * @param {string} role
 * @returns {string}
 */
function getRoleLabel(role) {
  const map = {
    super_admin: 'Super Admin',
    opd_admin: 'OPD Admin',
    clinic_admin: 'Clinic Admin',
    user_creator: 'User Creator',
  };
  return map[role] || role;
}

/* ============================================================
   PAGINATION HELPER
   ============================================================ */

/**
 * Render pagination buttons into a container.
 * @param {HTMLElement} container - The pagination container element
 * @param {number} currentPage - 1-indexed
 * @param {number} totalPages
 * @param {Function} onPageChange - Called with new page number
 */
function renderPagination(container, currentPage, totalPages, onPageChange) {
  if (!container) return;
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const createBtn = (label, page, isActive, isDisabled) => {
    const btn = document.createElement('button');
    btn.className = `pagination__btn${isActive ? ' pagination__btn--active' : ''}`;
    btn.textContent = label;
    btn.disabled = isDisabled;
    btn.setAttribute('aria-label', `Page ${label}`);
    if (!isDisabled && !isActive) {
      btn.addEventListener('click', () => onPageChange(page));
    }
    return btn;
  };

  // Previous
  container.appendChild(createBtn('‹', currentPage - 1, false, currentPage <= 1));

  // Page numbers (show max 5 around current)
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);

  for (let page = startPage; page <= endPage; page++) {
    container.appendChild(createBtn(String(page), page, page === currentPage, false));
  }

  // Next
  container.appendChild(createBtn('›', currentPage + 1, false, currentPage >= totalPages));
}

/* ============================================================
   SKELETON LOADER HELPERS
   ============================================================ */

/**
 * Create a skeleton loader row with given column widths.
 * @param {string[]} widths - CSS widths for each skeleton cell e.g. ['30%','50%','20%']
 * @returns {HTMLElement} Table row element
 */
function createSkeletonRow(widths = ['100%']) {
  const row = document.createElement('tr');
  widths.forEach(width => {
    const td = document.createElement('td');
    td.innerHTML = `<div class="skeleton skeleton--text" style="width:${width}"></div>`;
    row.appendChild(td);
  });
  return row;
}

/**
 * Replace a container's content with skeleton loaders.
 * @param {HTMLElement} container
 * @param {number} count - Number of skeleton cards to show
 */
function showSkeletonCards(container, count = 3) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="skeleton skeleton--title" style="width: 40%"></div>
      <div class="skeleton skeleton--text"></div>
      <div class="skeleton skeleton--text" style="width: 70%"></div>
    `;
    container.appendChild(card);
  }
}

/* ============================================================
   URL HELPERS
   ============================================================ */

/**
 * Get a URL search parameter by name.
 * @param {string} name
 * @returns {string|null}
 */
function getURLParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Build a URL with query parameters.
 * @param {string} base - Base URL path
 * @param {Object} params - Key-value pairs
 * @returns {string}
 */
function buildURL(base, params = {}) {
  const url = new URL(base, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  });
  return url.pathname + url.search;
}

/* ============================================================
   MISC UTILITIES
   ============================================================ */

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number} delay - Milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Deep clone an object using JSON (safe for simple data).
 * @param {*} obj
 * @returns {*}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Format a number with comma separators.
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString('en-LK');
}

/**
 * Generate a random UUID v4 (for client-side temporary IDs).
 * @returns {string}
 */
function generateTempUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Capitalize the first letter of each word.
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

/**
 * Check if a slot can be cancelled (current time < booking time - 2 hours).
 * @param {string} bookingDate - "YYYY-MM-DD"
 * @param {string} startTime - "HH:MM:SS"
 * @returns {boolean}
 */
function canCancelBooking(bookingDate, startTime) {
  const secondsRemaining = secondsUntilBooking(bookingDate, startTime);
  const cancellationWindowSeconds = (AMH_CONFIG?.APP?.CANCELLATION_WINDOW_HOURS || 2) * 3600;
  return secondsRemaining > cancellationWindowSeconds;
}

/**
 * Get initials from a full name (up to 2 characters).
 * @param {string} fullName
 * @returns {string} e.g. "MA" for "Mohamed Ashraff"
 */
function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Export table data to CSV and trigger download.
 * @param {Array<Object>} rows - Array of objects (each is a row)
 * @param {string[]} columns - Column keys in order
 * @param {string[]} headers - Column display headers
 * @param {string} filename - Download filename (without .csv)
 */
function exportToCSV(rows, columns, headers, filename) {
  const csvRows = [];

  // Header row
  csvRows.push(headers.map(h => `"${h}"`).join(','));

  // Data rows
  rows.forEach(row => {
    const values = columns.map(col => {
      const val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${getColomboDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Estimate wait time based on slot number and average consultation time.
 * @param {number} slotNumber - Your slot number
 * @param {string} startTime - Slot start time "HH:MM"
 * @returns {string} e.g. "Approx. 40 mins wait"
 */
function estimateWaitTime(slotNumber, startTime) {
  const avgMins = AMH_CONFIG?.APP?.AVG_CONSULTATION_MINUTES || 10;
  const waitMins = (slotNumber - 1) * avgMins;

  if (waitMins === 0) return 'You are first in queue';

  const [startH, startM] = startTime.split(':').map(Number);
  const totalMins = startH * 60 + startM + waitMins;
  const displayH = Math.floor(totalMins / 60) % 12 || 12;
  const displayM = String(totalMins % 60).padStart(2, '0');
  const ampm = totalMins / 60 >= 12 ? 'PM' : 'AM';

  return `Approx. ${waitMins} mins wait (your turn ~${displayH}:${displayM} ${ampm})`;
}

// ============================================================
// Initialize escape key handler on load
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupEscapeKey);
} else {
  setupEscapeKey();
}
