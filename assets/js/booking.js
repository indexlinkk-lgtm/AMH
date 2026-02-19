/**
 * booking.js — Shared Booking Logic
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Provides the booking calendar, slot availability, conflict
 * checking, and booking confirmation flow for both OPD and clinic.
 */

'use strict';

/* ============================================================
   BOOKING STATE MANAGEMENT
   ============================================================ */

/** Current booking state — shared across steps */
const BookingState = {
  type: null,          // 'opd' | 'clinic'
  clinicId: null,      // UUID (clinic bookings only)
  clinicName: null,
  selectedDate: null,  // "YYYY-MM-DD"
  selectedTemplate: null, // template object
  slotNumber: null,
  blockedDates: [],
  currentStep: 1,
};

/**
 * Reset booking state to initial values.
 */
function resetBookingState() {
  BookingState.selectedDate = null;
  BookingState.selectedTemplate = null;
  BookingState.slotNumber = null;
  BookingState.currentStep = 1;
}

/* ============================================================
   CALENDAR COMPONENT
   ============================================================ */

/**
 * Render an interactive booking calendar into a container.
 * @param {HTMLElement} container - Target element
 * @param {Object} config
 * @param {string} config.type - 'opd' | 'clinic'
 * @param {string} [config.clinicId] - Required for clinic type
 * @param {string[]} config.blockedDates - Array of "YYYY-MM-DD" blocked dates
 * @param {Function} config.onDateSelect - Called with selected "YYYY-MM-DD" date
 * @param {Date} [config.viewMonth] - Month to display (default current)
 */
async function renderBookingCalendar(container, config) {
  if (!container) return;

  const today = getColomboNow();
  const maxDate = addDays(today, AMH_CONFIG.APP.MAX_ADVANCE_BOOKING_DAYS);

  let viewMonth = config.viewMonth || new Date(today.getFullYear(), today.getMonth(), 1);

  /**
   * Determine if a date has available OPD slots.
   * @param {Date} date
   * @param {number[]} templateDays - Days of week that have templates
   * @returns {boolean}
   */
  function dateHasSlots(date, templateDays) {
    return templateDays.includes(date.getDay());
  }

  /**
   * Build and render the calendar for the current viewMonth.
   */
  async function buildCalendar() {
    // Fetch templates to know which days have slots
    let activeDays = [];
    if (config.type === 'opd') {
      const { data } = await getAllOPDTemplates();
      if (data) {
        activeDays = [...new Set(data.filter(t => t.is_active).map(t => t.day_of_week))];
      }
    } else if (config.type === 'clinic' && config.clinicId) {
      const { data } = await getClinicTemplates(config.clinicId);
      if (data) {
        activeDays = [...new Set(data.filter(t => t.is_active).map(t => t.day_of_week))];
      }
    }

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun

    const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const MONTH_NAMES = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];

    const isPrevDisabled = (year < today.getFullYear()) ||
      (year === today.getFullYear() && month <= today.getMonth());

    const isNextDisabled = (year > maxDate.getFullYear()) ||
      (year === maxDate.getFullYear() && month >= maxDate.getMonth());

    let html = `
      <div class="calendar">
        <div class="calendar__header">
          <button
            class="calendar__nav-btn"
            id="cal-prev"
            aria-label="Previous month"
            ${isPrevDisabled ? 'disabled' : ''}
            type="button"
          >‹</button>
          <span class="calendar__title">${MONTH_NAMES[month]} ${year}</span>
          <button
            class="calendar__nav-btn"
            id="cal-next"
            aria-label="Next month"
            ${isNextDisabled ? 'disabled' : ''}
            type="button"
          >›</button>
        </div>
        <div class="calendar__days-header">
          ${DAY_NAMES.map(d => `<div class="calendar__day-name">${d}</div>`).join('')}
        </div>
        <div class="calendar__grid" role="grid" aria-label="Booking calendar">
    `;

    // Fill leading empty cells
    for (let i = 0; i < startDow; i++) {
      html += `<div class="calendar__cell calendar__cell--other-month" role="gridcell" aria-hidden="true"></div>`;
    }

    // Fill date cells
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateStr = getColomboDateString(date);
      const isToday = dateStr === getColomboDateString(today);
      const isPast = dateStr < getColomboDateString(today);
      const isFuture = dateStr > getColomboDateString(maxDate);
      const isBlocked = config.blockedDates.includes(dateStr);
      const hasSlots = dateHasSlots(date, activeDays);
      const isSelected = dateStr === BookingState.selectedDate;

      let cellClass = 'calendar__cell';
      let dataAttrs = '';
      let ariaLabel = `${day} ${MONTH_NAMES[month]} ${year}`;

      if (isSelected) {
        cellClass += ' calendar__cell--selected';
        ariaLabel += ', selected';
      } else if (isPast || isFuture) {
        cellClass += ' calendar__cell--unavailable';
        ariaLabel += ', unavailable';
      } else if (isBlocked) {
        cellClass += ' calendar__cell--blocked';
        ariaLabel += ', blocked (holiday/closure)';
      } else if (!hasSlots) {
        cellClass += ' calendar__cell--unavailable';
        ariaLabel += ', no slots';
      } else {
        cellClass += ' calendar__cell--available';
        dataAttrs = `data-date="${dateStr}"`;
        ariaLabel += ', available';
      }

      if (isToday) {
        cellClass += ' calendar__cell--today';
        ariaLabel += ' (today)';
      }

      html += `
        <div
          class="${cellClass}"
          role="gridcell"
          ${dataAttrs}
          aria-label="${ariaLabel}"
          ${dataAttrs ? 'tabindex="0"' : ''}
        >${day}</div>
      `;
    }

    // Fill trailing empty cells to complete the grid
    const totalCells = startDow + lastDay.getDate();
    const trailingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < trailingCells; i++) {
      html += `<div class="calendar__cell calendar__cell--other-month" aria-hidden="true"></div>`;
    }

    html += `</div></div>`; // .calendar__grid, .calendar

    container.innerHTML = html;

    // Attach navigation handlers
    container.querySelector('#cal-prev')?.addEventListener('click', () => {
      viewMonth = new Date(year, month - 1, 1);
      buildCalendar();
    });

    container.querySelector('#cal-next')?.addEventListener('click', () => {
      viewMonth = new Date(year, month + 1, 1);
      buildCalendar();
    });

    // Attach date selection handlers
    container.querySelectorAll('.calendar__cell--available[data-date]').forEach(cell => {
      const handleSelect = () => {
        const dateStr = cell.dataset.date;
        BookingState.selectedDate = dateStr;
        config.onDateSelect(dateStr);
        buildCalendar(); // Re-render to show selection
      };

      cell.addEventListener('click', handleSelect);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      });
    });
  }

  await buildCalendar();
}

/* ============================================================
   TIME SLOT PICKER
   ============================================================ */

/**
 * Render the time slot picker for a selected date.
 * Shows all available time boxes with slot counts.
 * @param {HTMLElement} container - Target element
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} type - 'opd' | 'clinic'
 * @param {string} [clinicId] - Required for clinic
 * @param {Function} onTemplateSelect - Called with selected template object
 */
async function renderSlotPicker(container, dateStr, type, clinicId, onTemplateSelect) {
  if (!container) return;

  container.innerHTML = `
    <div class="card card--flat" style="padding: var(--space-5);">
      <div class="skeleton skeleton--title" style="width: 50%; margin-bottom: var(--space-4);"></div>
      <div class="skeleton skeleton--card" style="margin-bottom: var(--space-3);"></div>
      <div class="skeleton skeleton--card"></div>
    </div>
  `;

  try {
    let templates = [];

    if (type === 'opd') {
      const { data, error } = await getOPDAvailability(dateStr);
      if (error) throw new Error(error);
      templates = data || [];
    } else if (type === 'clinic' && clinicId) {
      const { data, error } = await getClinicAvailability(clinicId, dateStr);
      if (error) throw new Error(error);
      templates = data || [];
    }

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📅</div>
          <div class="empty-state__title">No Time Slots</div>
          <div class="empty-state__text">No appointment slots are available for ${formatDate(dateStr)}. Please select another date.</div>
        </div>
      `;
      return;
    }

    const displayDate = formatDate(dateStr);

    let html = `
      <div class="slot-picker">
        <div class="slot-picker__title">
          Available time slots for ${displayDate}
        </div>
    `;

    templates.forEach(template => {
      const available = parseInt(template.available, 10);
      const maxSlots = parseInt(template.max_slots, 10);
      const bookedCount = parseInt(template.booked_count, 10);
      const isFull = available <= 0;
      const fillPercent = Math.min(100, Math.round((bookedCount / maxSlots) * 100));

      let fillClass = 'time-box__progress-fill--low';
      if (fillPercent >= 80) fillClass = 'time-box__progress-fill--high';
      else if (fillPercent >= 50) fillClass = 'time-box__progress-fill--medium';

      const isSelected = BookingState.selectedTemplate?.template_id === template.template_id;

      html += `
        <div
          class="time-box${isFull ? ' time-box--full' : ''}${isSelected ? ' time-box--selected' : ''}"
          data-template-id="${template.template_id}"
          role="button"
          tabindex="${isFull ? '-1' : '0'}"
          aria-disabled="${isFull}"
          aria-label="${formatTimeRange(template.start_time, template.end_time)}, ${isFull ? 'fully booked' : available + ' slots available'}"
        >
          <div class="time-box__time">
            ${formatTimeRange(template.start_time, template.end_time)}
          </div>

          <div class="time-box__availability">
            <div class="time-box__progress-bar" role="progressbar" aria-valuenow="${bookedCount}" aria-valuemax="${maxSlots}">
              <div class="time-box__progress-fill ${fillClass}" style="width: ${fillPercent}%"></div>
            </div>
            <span class="time-box__count">
              ${isFull ? 'Fully Booked' : `${available} of ${maxSlots} slots available`}
            </span>
          </div>

          <div class="time-box__status">
            ${isFull
              ? '<span class="badge badge--full">FULL</span>'
              : `<span class="badge badge--available">${available} left</span>`
            }
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Attach click handlers
    container.querySelectorAll('.time-box:not(.time-box--full)').forEach(box => {
      const templateId = box.dataset.templateId;
      const templateData = templates.find(t => t.template_id === templateId);

      const handleSelect = () => {
        // Clear previous selection
        container.querySelectorAll('.time-box--selected').forEach(el =>
          el.classList.remove('time-box--selected')
        );
        box.classList.add('time-box--selected');
        BookingState.selectedTemplate = templateData;
        onTemplateSelect(templateData);
      };

      box.addEventListener('click', handleSelect);
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      });
    });

  } catch (err) {
    container.innerHTML = `
      <div class="alert alert--danger">
        <span class="alert__icon">⚠️</span>
        <div class="alert__content">
          <div class="alert__title">Failed to load time slots</div>
          <div class="alert__text">${sanitizeText(err.message)}</div>
        </div>
      </div>
    `;
  }
}

/* ============================================================
   BOOKING CONFIRMATION
   ============================================================ */

/**
 * Render the booking confirmation step.
 * Shows slot details and estimated wait time before confirming.
 * @param {HTMLElement} container
 * @param {Object} state - BookingState values
 * @param {Function} onConfirm - Called when confirm button clicked
 */
function renderBookingConfirmation(container, state, onConfirm) {
  if (!container || !state.selectedDate || !state.selectedTemplate) return;

  const template = state.selectedTemplate;
  const timeRange = formatTimeRange(template.start_time, template.end_time);
  const available = parseInt(template.available, 10);
  const estimatedSlot = (parseInt(template.booked_count, 10) || 0) + 1;
  const waitInfo = estimateWaitTime(estimatedSlot, template.start_time);

  container.innerHTML = `
    <div class="card" style="text-align: center; padding: var(--space-8);">
      <div style="font-size: 48px; margin-bottom: var(--space-5);">📋</div>
      <h3 style="font-size: var(--font-size-xl); color: var(--color-primary); margin-bottom: var(--space-6);">
        Confirm Your Appointment
      </h3>

      <div style="background: var(--color-bg); border-radius: var(--radius-lg); padding: var(--space-5); margin-bottom: var(--space-6); text-align: left;">
        <div style="display: grid; gap: var(--space-3);">
          <div class="flex-between">
            <span style="color: var(--color-text-muted); font-size: var(--font-size-sm);">Date</span>
            <span style="font-weight: 600;">${formatDate(state.selectedDate)}</span>
          </div>
          <div class="flex-between">
            <span style="color: var(--color-text-muted); font-size: var(--font-size-sm);">Time</span>
            <span style="font-weight: 600;">${timeRange}</span>
          </div>
          <div class="flex-between">
            <span style="color: var(--color-text-muted); font-size: var(--font-size-sm);">Type</span>
            <span style="font-weight: 600;">${state.type === 'opd' ? 'OPD' : state.clinicName || 'Clinic'}</span>
          </div>
          <div class="flex-between">
            <span style="color: var(--color-text-muted); font-size: var(--font-size-sm);">Your slot ~</span>
            <span style="font-weight: 700; color: var(--color-primary); font-size: var(--font-size-lg);">#${estimatedSlot}</span>
          </div>
          <div class="flex-between">
            <span style="color: var(--color-text-muted); font-size: var(--font-size-sm);">Remaining slots</span>
            <span style="font-weight: 600; color: var(--color-success);">${available - 1} after you</span>
          </div>
        </div>
      </div>

      <div class="alert alert--info" style="margin-bottom: var(--space-6); text-align: left;">
        <span class="alert__icon">ℹ️</span>
        <div class="alert__content">
          <div class="alert__text">${sanitizeText(waitInfo)}</div>
        </div>
      </div>

      <div style="display: flex; gap: var(--space-3); justify-content: center;">
        <button class="btn btn--ghost" id="booking-back-btn" type="button">
          ← Change Selection
        </button>
        <button class="btn btn--primary btn--lg" id="booking-confirm-btn" type="button">
          ✅ Confirm Booking
        </button>
      </div>
    </div>
  `;

  container.querySelector('#booking-back-btn')?.addEventListener('click', () => {
    BookingState.selectedTemplate = null;
    BookingState.currentStep = 2;
    // Caller handles step navigation
    container.dispatchEvent(new CustomEvent('booking:back'));
  });

  container.querySelector('#booking-confirm-btn')?.addEventListener('click', () => {
    onConfirm();
  });
}

/* ============================================================
   BOOKING SUBMISSION
   ============================================================ */

/**
 * Submit an OPD or clinic booking atomically.
 * Shows success modal with slot number on completion.
 * @param {string} patientId - Patient UUID
 * @param {Object} state - BookingState
 * @returns {Promise<void>}
 */
async function submitBooking(patientId, state) {
  const confirmBtn = document.getElementById('booking-confirm-btn');
  if (confirmBtn) disableSubmitButton(confirmBtn, 'Booking...');

  try {
    let result;

    if (state.type === 'opd') {
      result = await bookOPDSlot(patientId, state.selectedDate, state.selectedTemplate.template_id);
    } else {
      result = await bookClinicSlot(
        patientId,
        state.clinicId,
        state.selectedDate,
        state.selectedTemplate.template_id
      );
    }

    if (result.error) {
      Toast.error('Booking Failed', result.error);
      if (confirmBtn) enableSubmitButton(confirmBtn);
      return;
    }

    // Success — show confirmation modal
    showBookingSuccessModal(result.data, state);

  } catch (err) {
    Toast.error('Booking Error', err.message || 'Could not complete booking.');
    if (confirmBtn) enableSubmitButton(confirmBtn);
  }
}

/**
 * Show a success modal after a booking is confirmed.
 * @param {Object} bookingData - { booking_id, slot_number }
 * @param {Object} state - BookingState
 */
function showBookingSuccessModal(bookingData, state) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.display = 'flex';
  backdrop.style.zIndex = '9999';

  const dateDisplay = formatDate(state.selectedDate);
  const timeRange = formatTimeRange(
    state.selectedTemplate.start_time,
    state.selectedTemplate.end_time
  );

  backdrop.innerHTML = `
    <div class="modal" style="text-align: center;">
      <div class="modal__body" style="padding: var(--space-8);">
        <div style="font-size: 64px; margin-bottom: var(--space-5);">🎉</div>
        <h2 style="color: var(--color-success); margin-bottom: var(--space-3);">Booking Confirmed!</h2>
        <p style="color: var(--color-text-secondary); margin-bottom: var(--space-6);">
          Your appointment has been booked successfully.
        </p>

        <div class="queue-display" style="margin-bottom: var(--space-6);">
          <div class="queue-display__label">Your Queue Number</div>
          <div class="queue-display__number">${bookingData.slot_number}</div>
          <div class="queue-display__sublabel">${dateDisplay} · ${timeRange}</div>
        </div>

        <div class="alert alert--warning" style="text-align: left; margin-bottom: var(--space-6);">
          <span class="alert__icon">⚠️</span>
          <div class="alert__content">
            <div class="alert__title">Important Reminders</div>
            <div class="alert__text">
              • Arrive 15 minutes before your slot time<br>
              • Bring this ID card or remember your Patient ID<br>
              • Cancellations must be made at least 2 hours before
            </div>
          </div>
        </div>

        <button class="btn btn--primary btn--full" id="booking-success-close" type="button">
          Go to My Dashboard
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  backdrop.querySelector('#booking-success-close')?.addEventListener('click', () => {
    backdrop.remove();
    document.body.style.overflow = '';
    window.location.href = '../patient/dashboard.html';
  });
}

/* ============================================================
   BOOKING STEP NAVIGATION
   ============================================================ */

/**
 * Update the visual step indicators.
 * @param {number} currentStep - 1, 2, 3, or 4
 */
function updateBookingSteps(currentStep) {
  document.querySelectorAll('.booking-step').forEach((step, index) => {
    const stepNum = index + 1;
    step.classList.remove('booking-step--active', 'booking-step--done');

    if (stepNum < currentStep) {
      step.classList.add('booking-step--done');
    } else if (stepNum === currentStep) {
      step.classList.add('booking-step--active');
    }
  });

  // Show/hide step panels
  document.querySelectorAll('[data-step]').forEach(panel => {
    const panelStep = parseInt(panel.dataset.step, 10);
    panel.style.display = panelStep === currentStep ? 'block' : 'none';
  });
}

/**
 * Render booking step indicators HTML.
 * @param {string} type - 'opd' | 'clinic'
 * @returns {string} HTML string
 */
function renderBookingStepsHTML(type) {
  const steps = type === 'clinic'
    ? [
        { label: 'Select Clinic' },
        { label: 'Choose Date' },
        { label: 'Pick Time' },
        { label: 'Confirm' },
      ]
    : [
        { label: 'Choose Date' },
        { label: 'Pick Time Slot' },
        { label: 'Confirm' },
      ];

  let html = '<div class="booking-steps" role="list" aria-label="Booking steps">';

  steps.forEach((step, index) => {
    const stepNum = index + 1;
    if (index > 0) {
      html += '<div class="booking-step__connector" aria-hidden="true"></div>';
    }
    html += `
      <div class="booking-step" role="listitem" aria-label="Step ${stepNum}: ${step.label}">
        <div class="booking-step__number" aria-hidden="true">${stepNum}</div>
        <div class="booking-step__label">${step.label}</div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}
