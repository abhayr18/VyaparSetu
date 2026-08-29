const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose protected electron APIs to the renderer process
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Generates / receives the invoice PDF, places it on the Windows clipboard (CF_HDROP),
   * opens WhatsApp chat with recipient, and auto-pastes the file via Ctrl+V.
   *
   * @param {Object} options
   * @param {string|number} options.invoiceId
   * @param {string} [options.invoiceNumber]
   * @param {string} [options.customerPhone]
   * @param {string} [options.message]
   * @param {string} [options.pdfBase64] Base64 encoded PDF string
   * @param {string} [options.filename] Optional custom filename
   * @returns {Promise<{ success: boolean, pdfPath?: string, error?: string }>}
   */
  shareWhatsApp: (options) => ipcRenderer.invoke('share-whatsapp', options),

  /**
   * Opens external URLs in the user's default system browser (for Google OAuth, etc.)
   * @param {string} url
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  isElectron: true,
});
