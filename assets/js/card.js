/**
 * card.js — Patient Card Rendering, Print, and PNG Download
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Renders the glassmorphism patient ID card, triggers print,
 * and exports as PNG using html2canvas.
 */

'use strict';

/**
 * Render the patient ID card into a target container.
 * Generates a QR code and populates all patient fields.
 *
 * @param {string|HTMLElement} containerEl - Target element or selector
 * @param {Object} patient - Patient session or record object
 * @param {Object} [options]
 * @param {boolean} [options.showActions] - Show print/download buttons (default true)
 * @param {boolean} [options.forPrint] - Use print-optimized markup (default false)
 * @returns {Promise<void>}
 */
async function renderPatientCard(containerEl, patient, options = {}) {
  const container = typeof containerEl === 'string'
    ? document.querySelector(containerEl)
    : containerEl;

  if (!container || !patient) return;

  const showActions = options.showActions !== false;
  const cardId = 'patient-id-card';

  // Build card HTML
  container.innerHTML = `
    <div class="patient-card" id="${cardId}" aria-label="Patient ID Card">
      <div class="patient-card__header">
        <div class="patient-card__hospital-info">
          <div class="patient-card__logo-placeholder" aria-hidden="true">🏥</div>
          <div>
            <div class="patient-card__hospital-name">Ashraff Hospital</div>
            <div class="patient-card__hospital-sub">Kalmunai, Sri Lanka</div>
          </div>
        </div>
        <span class="patient-card__badge">PATIENT ID CARD</span>
      </div>

      <div class="patient-card__body">
        <div class="patient-card__info">
          <div class="patient-card__id" aria-label="Patient ID">${sanitizeText(patient.unique_patient_id)}</div>
          <div class="patient-card__name" aria-label="Patient Name">${sanitizeText(patient.full_name)}</div>

          <div class="patient-card__details">
            <div class="patient-card__detail-row">
              <span class="patient-card__detail-label">Age / Gender</span>
              <span class="patient-card__detail-value">${sanitizeText(patient.age)} / ${sanitizeText(patient.gender)}</span>
            </div>
            <div class="patient-card__detail-row">
              <span class="patient-card__detail-label">NIC</span>
              <span class="patient-card__detail-value">${sanitizeText(patient.nic_number)}</span>
            </div>
            <div class="patient-card__detail-row">
              <span class="patient-card__detail-label">Phone</span>
              <span class="patient-card__detail-value">${sanitizeText(patient.phone_number)}</span>
            </div>
            <div class="patient-card__detail-row">
              <span class="patient-card__detail-label">Registered</span>
              <span class="patient-card__detail-value">${formatDate(patient.created_at)}</span>
            </div>
          </div>
        </div>

        <div class="patient-card__qr" aria-label="QR Code">
          <div class="patient-card__qr-box" id="card-qr-container"></div>
          <span class="patient-card__qr-label">Scan to Verify</span>
        </div>
      </div>

      <div class="patient-card__footer">
        <span class="patient-card__footer-text">Ashraff Hospital Kalmunai</span>
        <span class="patient-card__footer-id">${sanitizeText(patient.unique_patient_id)}</span>
      </div>
    </div>

    ${showActions ? `
    <div class="patient-card__actions" role="group" aria-label="Card actions">
      <button
        class="btn btn--outline-primary"
        id="print-card-btn"
        aria-label="Print patient card"
        type="button"
      >
        🖨️ Print Card
      </button>
      <button
        class="btn btn--primary"
        id="download-card-btn"
        aria-label="Download patient card as PNG"
        type="button"
      >
        ⬇️ Download PNG
      </button>
    </div>
    ` : ''}
  `;

  // Generate QR code
  const qrContainer = container.querySelector('#card-qr-container');
  if (qrContainer) {
    await generateQRCode(qrContainer, patient.unique_patient_id, {
      width: 120,
      colorDark: '#1A3C6E',
      colorLight: '#FFFFFF',
      errorCorrectionLevel: 'M',
    });
  }

  // Attach action handlers
  if (showActions) {
    const printBtn = container.querySelector('#print-card-btn');
    const downloadBtn = container.querySelector('#download-card-btn');

    if (printBtn) {
      printBtn.addEventListener('click', () => printPatientCard(patient.unique_patient_id));
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => downloadPatientCardAsPNG(
        container.querySelector(`#${cardId}`),
        patient.unique_patient_id
      ));
    }
  }
}

/**
 * Trigger the browser print dialog for the patient card.
 * Uses print.css media query to show only the card.
 * @param {string} patientId - For the document title
 */
function printPatientCard(patientId) {
  const originalTitle = document.title;
  document.title = `Patient Card — ${patientId}`;

  // Create or update the print-target wrapper
  let printWrapper = document.getElementById('print-target-wrapper');
  const cardEl = document.getElementById('patient-id-card');

  if (!cardEl) {
    Toast.error('Print Error', 'Patient card not rendered.');
    return;
  }

  if (!printWrapper) {
    printWrapper = document.createElement('div');
    printWrapper.id = 'print-target-wrapper';
    document.body.appendChild(printWrapper);
  }

  // Clone the card into the print wrapper
  const cloned = cardEl.cloneNode(true);
  cloned.id = 'print-target';
  printWrapper.innerHTML = '';
  printWrapper.appendChild(cloned);

  window.print();

  // Restore title after print dialog closes
  setTimeout(() => {
    document.title = originalTitle;
  }, 500);
}

/**
 * Download the patient card as a PNG image using html2canvas.
 * @param {HTMLElement} cardElement - The card DOM element
 * @param {string} patientId - Used for the filename
 * @returns {Promise<void>}
 */
async function downloadPatientCardAsPNG(cardElement, patientId) {
  if (!cardElement) {
    Toast.error('Download Error', 'Patient card not found.');
    return;
  }

  if (!window.html2canvas) {
    Toast.error('Download Error', 'html2canvas library not loaded.');
    return;
  }

  const downloadBtn = document.getElementById('download-card-btn');
  if (downloadBtn) {
    disableSubmitButton(downloadBtn, 'Generating...');
  }

  try {
    const canvas = await window.html2canvas(cardElement, {
      scale: 3,           // 3x scale for ~300 DPI equivalent
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#FFFFFF',
      logging: false,
      imageTimeout: 5000,
    });

    // Convert to PNG and trigger download
    const dataURL = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `${patientId}_card.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Toast.success('Download Complete', `Card saved as ${patientId}_card.png`);

  } catch (err) {
    console.error('Card download failed:', err);
    Toast.error('Download Failed', 'Could not generate card image. Please try printing instead.');
  } finally {
    if (downloadBtn) {
      enableSubmitButton(downloadBtn);
    }
  }
}

/**
 * Render a compact card preview (no actions) for admin view.
 * @param {string|HTMLElement} containerEl
 * @param {Object} patient
 * @returns {Promise<void>}
 */
async function renderPatientCardPreview(containerEl, patient) {
  await renderPatientCard(containerEl, patient, { showActions: false });
}

/**
 * Render a full card with a "Welcome" banner for new registrations.
 * @param {string|HTMLElement} containerEl
 * @param {Object} patient
 * @returns {Promise<void>}
 */
async function renderNewPatientCard(containerEl, patient) {
  const container = typeof containerEl === 'string'
    ? document.querySelector(containerEl)
    : containerEl;
  if (!container) return;

  // Insert welcome banner before the card
  const banner = document.createElement('div');
  banner.className = 'alert alert--success mb-6';
  banner.innerHTML = `
    <span class="alert__icon">🎉</span>
    <div class="alert__content">
      <div class="alert__title">Registration Successful!</div>
      <div class="alert__text">
        Your Patient ID is <strong>${sanitizeText(patient.unique_patient_id)}</strong>.
        Please save this ID — you'll need it to log in. Print or download your card below.
      </div>
    </div>
  `;

  container.appendChild(banner);

  // Render the card
  const cardWrapper = document.createElement('div');
  container.appendChild(cardWrapper);
  await renderPatientCard(cardWrapper, patient, { showActions: true });
}
