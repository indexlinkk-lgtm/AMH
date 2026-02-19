/**
 * qr.js — QR Code Generation Wrapper
 * Ashraff Hospital Kalmunai — AMH Patient Management System
 *
 * Wraps the qrcode.js CDN library to generate QR codes
 * encoding only the patient's unique_patient_id.
 */

'use strict';

/**
 * Generate a QR code and render it into a target element.
 * The QR code encodes only the patient's unique_patient_id.
 *
 * @param {string|HTMLElement} targetEl - DOM element or selector to render into
 * @param {string} patientId - The unique_patient_id to encode (e.g. "AMH2026000123")
 * @param {Object} [options] - QR rendering options
 * @param {number} [options.width] - QR canvas size in px (default 128)
 * @param {number} [options.margin] - Quiet zone margin (default 1)
 * @param {string} [options.colorDark] - Dark module color (default '#1A3C6E')
 * @param {string} [options.colorLight] - Light module color (default '#FFFFFF')
 * @param {string} [options.errorCorrectionLevel] - 'L','M','Q','H' (default 'M')
 * @returns {Promise<void>}
 */
async function generateQRCode(targetEl, patientId, options = {}) {
  if (!targetEl) {
    console.warn('generateQRCode: target element is null');
    return;
  }

  const container = typeof targetEl === 'string'
    ? document.querySelector(targetEl)
    : targetEl;

  if (!container) {
    console.warn('generateQRCode: container not found');
    return;
  }

  // Wait for QRCode library to be available
  if (!window.QRCode) {
    console.error('QRCode library not loaded. Check CDN script tag.');
    container.innerHTML = '<p style="color:red;font-size:11px;">QR Error</p>';
    return;
  }

  // Clear any existing content
  container.innerHTML = '';

  const qrOptions = {
    text: patientId,
    width: options.width || 128,
    height: options.width || 128,
    colorDark: options.colorDark || '#1A3C6E',
    colorLight: options.colorLight || '#FFFFFF',
    correctLevel: resolveErrorCorrectionLevel(
      options.errorCorrectionLevel || 'M'
    ),
  };

  try {
    // qrcode.js uses a constructor
    new window.QRCode(container, qrOptions);
  } catch (err) {
    console.error('QR generation failed:', err.message);
    container.innerHTML = '<p style="color:red;font-size:11px;">QR Error</p>';
  }
}

/**
 * Resolve the error correction level constant from the qrcode library.
 * @param {string} level - 'L' | 'M' | 'Q' | 'H'
 * @returns {number} QRCode.CorrectLevel value
 */
function resolveErrorCorrectionLevel(level) {
  if (!window.QRCode) return 1;
  const levels = {
    L: window.QRCode.CorrectLevel?.L ?? 1,
    M: window.QRCode.CorrectLevel?.M ?? 0,
    Q: window.QRCode.CorrectLevel?.Q ?? 3,
    H: window.QRCode.CorrectLevel?.H ?? 2,
  };
  return levels[level.toUpperCase()] ?? levels['M'];
}

/**
 * Generate a QR code and return it as a data URL (PNG).
 * Used by the card download function (html2canvas captures the rendered QR).
 * @param {string} patientId
 * @param {number} [size] - Pixel size (default 256 for high-res export)
 * @returns {Promise<string>} Data URL
 */
async function generateQRDataURL(patientId, size = 256) {
  return new Promise((resolve, reject) => {
    if (!window.QRCode) {
      reject(new Error('QRCode library not loaded'));
      return;
    }

    // Create a temporary off-screen container
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '-9999px';
    document.body.appendChild(tempDiv);

    try {
      const qr = new window.QRCode(tempDiv, {
        text: patientId,
        width: size,
        height: size,
        colorDark: '#1A3C6E',
        colorLight: '#FFFFFF',
        correctLevel: resolveErrorCorrectionLevel('M'),
      });

      // QR code renders asynchronously
      setTimeout(() => {
        const canvas = tempDiv.querySelector('canvas');
        const img = tempDiv.querySelector('img');

        let dataURL = '';
        if (canvas) {
          dataURL = canvas.toDataURL('image/png');
        } else if (img) {
          dataURL = img.src;
        }

        document.body.removeChild(tempDiv);

        if (dataURL) {
          resolve(dataURL);
        } else {
          reject(new Error('QR code canvas not found'));
        }
      }, 200);

    } catch (err) {
      document.body.removeChild(tempDiv);
      reject(err);
    }
  });
}

/**
 * Generate QR code for all elements matching a selector.
 * Useful for rendering QR codes in admin queue tables.
 * @param {string} selector - CSS selector for containers
 * @param {Function} getPatientId - Function(element) => patientId string
 */
async function generateQRCodesForSelector(selector, getPatientId) {
  const elements = document.querySelectorAll(selector);
  for (const el of elements) {
    const patientId = getPatientId(el);
    if (patientId) {
      await generateQRCode(el, patientId, { width: 80 });
    }
  }
}
