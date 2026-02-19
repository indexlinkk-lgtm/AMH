/**
 * countdown.js — Live Countdown Timer Component
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Renders real-time countdown timers for upcoming appointments.
 * Updates every second via setInterval.
 * Color-coded: green (>2hrs), orange (<2hrs), red (<30mins).
 */

'use strict';

/** Map of active countdown intervals — keyed by element ID */
const activeCountdowns = new Map();

/**
 * Start a countdown timer that updates in real-time.
 * @param {HTMLElement|string} containerEl - Target element or selector
 * @param {string} bookingDate - "YYYY-MM-DD"
 * @param {string} startTime - "HH:MM:SS"
 * @param {Object} [options]
 * @param {Function} [options.onExpired] - Called when countdown reaches 0
 */
function startCountdown(containerEl, bookingDate, startTime, options = {}) {
  const container = typeof containerEl === 'string'
    ? document.querySelector(containerEl)
    : containerEl;

  if (!container) return;

  // Generate a unique ID for this countdown
  const countdownId = container.id || `countdown_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  if (!container.id) container.id = countdownId;

  // Stop any existing countdown on this element
  stopCountdown(countdownId);

  /**
   * Render the current countdown state.
   */
  function render() {
    const secondsRemaining = secondsUntilBooking(bookingDate, startTime);

    if (secondsRemaining <= 0) {
      // Appointment time has arrived or passed
      renderExpired(container);
      stopCountdown(countdownId);
      if (options.onExpired) options.onExpired();
      return;
    }

    const { days, hours, minutes, seconds } = parseCountdown(secondsRemaining);
    const totalHours = secondsRemaining / 3600;

    // Determine color class based on remaining time
    let colorClass = 'countdown-timer--green';
    if (totalHours < 0.5) {
      colorClass = 'countdown-timer--red';
    } else if (totalHours < 2) {
      colorClass = 'countdown-timer--orange';
    }

    container.innerHTML = `
      <div class="countdown-timer ${colorClass}" role="timer" aria-live="off" aria-label="Time until appointment: ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds">
        ${days > 0 ? `
        <div class="countdown-unit" aria-label="${days} days">
          <span class="countdown-unit__value">${String(days).padStart(2, '0')}</span>
          <span class="countdown-unit__label">DAYS</span>
        </div>
        <span class="countdown-separator" aria-hidden="true">:</span>
        ` : ''}
        <div class="countdown-unit" aria-label="${hours} hours">
          <span class="countdown-unit__value">${String(hours).padStart(2, '0')}</span>
          <span class="countdown-unit__label">HRS</span>
        </div>
        <span class="countdown-separator" aria-hidden="true">:</span>
        <div class="countdown-unit" aria-label="${minutes} minutes">
          <span class="countdown-unit__value">${String(minutes).padStart(2, '0')}</span>
          <span class="countdown-unit__label">MINS</span>
        </div>
        <span class="countdown-separator" aria-hidden="true">:</span>
        <div class="countdown-unit" aria-label="${seconds} seconds">
          <span class="countdown-unit__value">${String(seconds).padStart(2, '0')}</span>
          <span class="countdown-unit__label">SECS</span>
        </div>
      </div>
    `;
  }

  // Render immediately
  render();

  // Start interval
  const intervalId = setInterval(render, 1000);
  activeCountdowns.set(countdownId, intervalId);
}

/**
 * Render the "expired/arrived" state for a countdown.
 * @param {HTMLElement} container
 */
function renderExpired(container) {
  container.innerHTML = `
    <div class="countdown-expired" role="status" aria-live="polite">
      <span style="font-size: 28px;">🕐</span>
      <span>Your appointment time has arrived!</span>
    </div>
  `;
}

/**
 * Stop a countdown timer by container ID.
 * @param {string} countdownId - The element's ID
 */
function stopCountdown(countdownId) {
  const intervalId = activeCountdowns.get(countdownId);
  if (intervalId) {
    clearInterval(intervalId);
    activeCountdowns.delete(countdownId);
  }
}

/**
 * Stop all active countdown timers.
 * Call on page unload or when navigating away.
 */
function stopAllCountdowns() {
  activeCountdowns.forEach((intervalId) => clearInterval(intervalId));
  activeCountdowns.clear();
}

/**
 * Render a complete booking countdown card including department info.
 * @param {HTMLElement} container - Target for the full card
 * @param {Object} booking - Booking object with slot template data
 * @param {string} bookingType - 'opd' | 'clinic'
 */
function renderCountdownCard(container, booking, bookingType) {
  if (!container || !booking) return;

  const template = bookingType === 'opd'
    ? booking.opd_slot_templates
    : booking.clinic_slot_templates;

  const departmentName = bookingType === 'opd'
    ? 'OPD (Outpatient Department)'
    : booking.clinics?.clinic_name || 'Clinic';

  const doctorName = bookingType === 'clinic'
    ? (template?.doctor_name || booking.clinics?.doctor_name || '—')
    : null;

  const startTime = template?.start_time || '00:00:00';
  const endTime = template?.end_time || '00:00:00';

  container.innerHTML = `
    <div class="countdown-card">
      <div class="countdown-card__label">NEXT APPOINTMENT COUNTDOWN</div>
      <div class="countdown-card__info">
        <div class="countdown-card__department">${sanitizeText(departmentName)}</div>
        <div class="countdown-card__details">
          <div class="countdown-card__detail">
            <span class="countdown-card__detail-icon">📅</span>
            <span>${formatDate(booking.booking_date)}</span>
          </div>
          <div class="countdown-card__detail">
            <span class="countdown-card__detail-icon">🕐</span>
            <span>${formatTimeRange(startTime, endTime)}</span>
          </div>
          <div class="countdown-card__detail">
            <span class="countdown-card__detail-icon">🔢</span>
            <span>Queue #${booking.slot_number}</span>
          </div>
          ${doctorName ? `
          <div class="countdown-card__detail">
            <span class="countdown-card__detail-icon">👨‍⚕️</span>
            <span>${sanitizeText(doctorName)}</span>
          </div>
          ` : ''}
        </div>
      </div>
      <div id="countdown-timer-${booking.id}"></div>
    </div>
  `;

  // Start the countdown
  const timerEl = container.querySelector(`#countdown-timer-${booking.id}`);
  if (timerEl) {
    startCountdown(timerEl, booking.booking_date, startTime, {
      onExpired: () => {
        // Update the card label when time arrives
        const labelEl = container.querySelector('.countdown-card__label');
        if (labelEl) labelEl.textContent = '⏰ APPOINTMENT TIME';
      },
    });
  }
}

// Stop all countdowns when page unloads
window.addEventListener('beforeunload', stopAllCountdowns);
window.addEventListener('pagehide', stopAllCountdowns);
