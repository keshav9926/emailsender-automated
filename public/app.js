// --- AeroSend Client Orchestrator JS ---

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let appState = {
    status: 'stopped', // 'sending', 'paused', 'stopped'
    stats: { total: 0, sent: 0, failed: 0, pending: 0, skipped: 0, sending: 0 },
    contacts: [],
    filteredContacts: [],
    settings: {
      smtp: { host: '', port: 587, secure: false, user: '', pass: '', senderName: '', senderEmail: '' },
      template: { subject: '', body: '' },
      delay: 10000
    },
    // Pagination
    pageSize: 50,
    currentPage: 1,
    // Preview
    previewIndex: 0,
    // Polling
    pollInterval: null,
    isPolling: false
  };

  // --- DOM SELECTORS ---
  const screens = document.querySelectorAll('.screen');
  const navButtons = document.querySelectorAll('.nav-item');
  const screenTitle = document.getElementById('screen-title');
  const screenSubtitle = document.getElementById('screen-subtitle');
  
  // Stats
  const statTotal = document.getElementById('stat-total');
  const statSent = document.getElementById('stat-sent');
  const statFailed = document.getElementById('stat-failed');
  const statPending = document.getElementById('stat-pending');
  
  // Server Indicator
  const serverDot = document.getElementById('server-dot');
  const serverStatusText = document.getElementById('server-status-text');
  
  // Controls
  const btnStart = document.getElementById('ctrl-start');
  const btnPause = document.getElementById('ctrl-pause');
  const btnReset = document.getElementById('ctrl-reset');
  const sliderDelay = document.getElementById('delay-slider');
  const badgeDelay = document.getElementById('delay-value-badge');
  const terminalLogs = document.getElementById('terminal-logs');
  const reimportBtn = document.getElementById('reimport-pdf-btn');
  
  // Recipients Table
  const tableBody = document.getElementById('recipients-tbody');
  const searchInput = document.getElementById('recipient-search');
  const filterStatus = document.getElementById('recipient-filter-status');
  const pagStart = document.getElementById('pagination-start');
  const pagEnd = document.getElementById('pagination-end');
  const pagTotal = document.getElementById('pagination-total');
  const pageNumbersContainer = document.getElementById('page-numbers');
  const btnPagePrev = document.getElementById('page-prev');
  const btnPageNext = document.getElementById('page-next');
  
  // Template Editor & Preview
  const inputSubject = document.getElementById('template-subject');
  const textareaBody = document.getElementById('template-body');
  const btnSaveTemplate = document.getElementById('save-template-btn');
  const tagBtns = document.querySelectorAll('.tag-btn');
  
  const previewToEmail = document.getElementById('preview-to-email');
  const previewSubject = document.getElementById('preview-subject');
  const previewBodyContent = document.getElementById('preview-body-content');
  const btnPrevPreview = document.getElementById('prev-preview-btn');
  const btnNextPreview = document.getElementById('next-preview-btn');
  const lblPreviewRecipient = document.getElementById('preview-recipient-label');
  
  // SMTP Settings
  const smtpForm = document.getElementById('smtp-settings-form');
  const inputSmtpHost = document.getElementById('smtp-host');
  const inputSmtpPort = document.getElementById('smtp-port');
  const inputSmtpUser = document.getElementById('smtp-user');
  const inputSmtpPass = document.getElementById('smtp-pass');
  const btnToggleSmtpPass = document.getElementById('toggle-smtp-pass');
  const inputSenderName = document.getElementById('smtp-sender-name');
  const inputSenderEmail = document.getElementById('smtp-sender-email');
  const testRecipientEmail = document.getElementById('test-email-recipient');
  const btnRunSmtpTest = document.getElementById('run-smtp-test-btn');
  const testTerminal = document.getElementById('test-terminal');

  // --- INITIALIZATION ---
  initNavigation();
  loadSettings();
  loadContacts();
  startStatusPolling(2000); // Poll status every 2 seconds initially

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    if (type === 'success') {
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    } else if (type === 'error') {
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>`;
    } else {
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;
    }
    
    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slide-in 0.3s ease reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --- NAVIGATION ---
  function initNavigation() {
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetScreen = btn.getAttribute('data-target');
        
        // Toggle Active nav buttons
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Toggle Active screen
        screens.forEach(screen => screen.classList.remove('active'));
        document.getElementById(targetScreen).classList.add('active');
        
        // Update Title & Subtitle based on screen
        updateHeaderInfo(targetScreen);
      });
    });
  }

  function updateHeaderInfo(screenId) {
    const titles = {
      'screen-dashboard': { title: 'Outreach Dashboard', subtitle: 'Real-time campaign status and automation controls' },
      'screen-recipients': { title: 'Recipients Database', subtitle: 'Manage email leads extracted from PDF' },
      'screen-template': { title: 'Email Template Composer', subtitle: 'Design customized emails with placeholder variables' },
      'screen-settings': { title: 'SMTP Mail Server Settings', subtitle: 'Configure connection credentials and test outputs' }
    };
    
    if (titles[screenId]) {
      screenTitle.textContent = titles[screenId].title;
      screenSubtitle.textContent = titles[screenId].subtitle;
    }
  }

  // --- SETTINGS (SMTP & TEMPLATE) ---
  async function loadSettings() {
    try {
      const response = await fetch('/api/settings');
      const settings = await response.json();
      appState.settings = settings;
      
      // Populate SMTP fields
      inputSmtpHost.value = settings.smtp.host || '';
      inputSmtpPort.value = settings.smtp.port || 587;
      inputSmtpUser.value = settings.smtp.user || '';
      inputSmtpPass.value = settings.smtp.pass ? '••••••••••••••••' : '';
      inputSenderName.value = settings.smtp.senderName || '';
      inputSenderEmail.value = settings.smtp.senderEmail || '';
      
      const isSecure = settings.smtp.secure === true || settings.smtp.secure === 'true';
      document.querySelector(`input[name="smtp-secure"][value="${isSecure}"]`).checked = true;
      
      // Populate Template fields
      inputSubject.value = settings.template.subject || '';
      textareaBody.value = settings.template.body || '';
      
      // Populate Delay slider
      const delaySec = (settings.delay || 10000) / 1000;
      sliderDelay.value = delaySec;
      badgeDelay.textContent = `${delaySec}s`;
      
      updateLivePreview();
    } catch (e) {
      showToast('Failed to load settings from server.', 'error');
    }
  }

  // Save SMTP Settings
  smtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = { ...appState.settings };
    
    settings.smtp.host = inputSmtpHost.value.trim();
    settings.smtp.port = parseInt(inputSmtpPort.value);
    settings.smtp.user = inputSmtpUser.value.trim();
    
    // Only capture password if it's not the masked placeholder
    const passwordVal = inputSmtpPass.value;
    if (passwordVal !== '••••••••••••••••') {
      settings.smtp.pass = passwordVal;
    }
    
    settings.smtp.senderName = inputSenderName.value.trim();
    settings.smtp.senderEmail = inputSenderEmail.value.trim();
    settings.smtp.secure = document.querySelector('input[name="smtp-secure"]:checked').value === 'true';
    
    settings.delay = parseInt(sliderDelay.value) * 1000;
    
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (data.success) {
        appState.settings = data.settings;
        showToast('SMTP settings saved successfully.', 'success');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showToast('Error saving settings: ' + err.message, 'error');
    }
  });

  // Save Template
  btnSaveTemplate.addEventListener('click', async () => {
    const settings = { ...appState.settings };
    settings.template.subject = inputSubject.value.trim();
    settings.template.body = textareaBody.value;
    
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (data.success) {
        appState.settings = data.settings;
        showToast('Email template saved successfully.', 'success');
        updateLivePreview();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showToast('Error saving template: ' + err.message, 'error');
    }
  });

  // SMTP Toggle Password visibility
  btnToggleSmtpPass.addEventListener('click', () => {
    const type = inputSmtpPass.getAttribute('type') === 'password' ? 'text' : 'password';
    inputSmtpPass.setAttribute('type', type);
    
    // Toggle class
    btnToggleSmtpPass.classList.toggle('active');
  });

  // --- SMTP DIAGNOSTIC TEST ---
  btnRunSmtpTest.addEventListener('click', async () => {
    const targetEmail = testRecipientEmail.value.trim();
    if (!targetEmail) {
      showToast('Please specify a recipient email for testing.', 'error');
      return;
    }
    
    btnRunSmtpTest.disabled = true;
    testTerminal.innerHTML = '<div class="terminal-line warning-line">[SMTP TEST] Establishing SMTP server handshake...</div>';
    
    const smtpSettings = {
      host: inputSmtpHost.value.trim(),
      port: parseInt(inputSmtpPort.value),
      user: inputSmtpUser.value.trim(),
      pass: inputSmtpPass.value === '••••••••••••••••' ? appState.settings.smtp.pass : inputSmtpPass.value,
      senderName: inputSenderName.value.trim(),
      senderEmail: inputSenderEmail.value.trim(),
      secure: document.querySelector('input[name="smtp-secure"]:checked').value === 'true'
    };
    
    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp: smtpSettings, testEmail: targetEmail })
      });
      
      const data = await response.json();
      btnRunSmtpTest.disabled = false;
      
      if (response.ok && data.success) {
        testTerminal.innerHTML += `<div class="terminal-line success-line">[SMTP TEST] SUCCESS: ${data.message}</div>`;
        showToast('SMTP Test Email Sent!', 'success');
      } else {
        testTerminal.innerHTML += `<div class="terminal-line error-line">[SMTP TEST] FAILURE: ${data.error || 'Connection failed'}</div>`;
        showToast('SMTP Connection Failed.', 'error');
      }
    } catch (err) {
      btnRunSmtpTest.disabled = false;
      testTerminal.innerHTML += `<div class="terminal-line error-line">[SMTP TEST] ERROR: ${err.message}</div>`;
      showToast('Failed to run SMTP test connection.', 'error');
    }
  });

  // --- CONTACTS DATABASE ---
  async function loadContacts() {
    try {
      const response = await fetch('/api/contacts');
      const contacts = await response.json();
      appState.contacts = contacts;
      appState.filteredContacts = [...contacts];
      
      // Update preview index if out of range
      if (appState.previewIndex >= contacts.length) {
        appState.previewIndex = 0;
      }
      
      renderRecipientsTable();
      updateLivePreview();
    } catch (e) {
      showToast('Error loading contacts list.', 'error');
    }
  }

  // Reload PDF
  reimportBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reload and re-parse the PDF? This will reset all sending status back to pending.')) {
      return;
    }
    
    reimportBtn.disabled = true;
    showToast('Reloading and parsing PDF... Please wait.', 'info');
    
    try {
      const response = await fetch('/api/import-pdf', { method: 'POST' });
      const data = await response.json();
      reimportBtn.disabled = false;
      
      if (data.success) {
        showToast(`Successfully imported ${data.count} contacts from PDF.`, 'success');
        loadContacts();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      reimportBtn.disabled = false;
      showToast('Failed to reload PDF: ' + err.message, 'error');
    }
  });

  // Search & Filter
  searchInput.addEventListener('input', runFilters);
  filterStatus.addEventListener('change', runFilters);

  function runFilters() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const statusVal = filterStatus.value;
    
    appState.filteredContacts = appState.contacts.filter(contact => {
      // 1. Search text filter
      const matchesSearch = 
        contact.name.toLowerCase().includes(searchVal) ||
        contact.email.toLowerCase().includes(searchVal) ||
        contact.company.toLowerCase().includes(searchVal) ||
        contact.title.toLowerCase().includes(searchVal);
        
      // 2. Status dropdown filter
      const matchesStatus = (statusVal === 'all') || (contact.status === statusVal);
      
      return matchesSearch && matchesStatus;
    });
    
    appState.currentPage = 1; // reset page on search
    renderRecipientsTable();
  }

  // Render Table
  function renderRecipientsTable() {
    const startIndex = (appState.currentPage - 1) * appState.pageSize;
    const endIndex = Math.min(startIndex + appState.pageSize, appState.filteredContacts.length);
    
    const pageContacts = appState.filteredContacts.slice(startIndex, endIndex);
    
    // Update pagination labels
    pagStart.textContent = appState.filteredContacts.length > 0 ? startIndex + 1 : 0;
    pagEnd.textContent = endIndex;
    pagTotal.textContent = appState.filteredContacts.length;
    
    if (pageContacts.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px;">
            No contacts match the active filter criteria.
          </td>
        </tr>
      `;
      renderPaginationControls();
      return;
    }
    
    tableBody.innerHTML = pageContacts.map(c => {
      let badgeClass = c.status;
      let badgeLabel = c.status;
      
      if (c.status === 'sending') {
        badgeClass = 'sending';
        badgeLabel = 'Sending';
      }
      
      const isSkipped = c.status === 'skipped';
      const actionIcon = isSkipped ? 
        // Eye off (Include action)
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>` :
        // Eye (Skip action)
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
        
      const errorTooltip = c.error ? `title="Error: ${c.error}" style="cursor: help;"` : '';
      
      return `
        <tr class="recipient-row ${isSkipped ? 'row-skipped' : ''}">
          <td>${c.sno}</td>
          <td>
            <div class="contact-meta">
              <span class="contact-name">${escapeHtml(c.name)}</span>
              <span class="contact-email">${escapeHtml(c.email)}</span>
            </div>
          </td>
          <td>
            <div class="company-meta">
              <span class="company-title">${escapeHtml(c.title)}</span>
              <span class="company-name">${escapeHtml(c.company)}</span>
            </div>
          </td>
          <td>
            <span class="status-badge ${badgeClass}" ${errorTooltip}>${badgeLabel}</span>
          </td>
          <td>
            <div style="display: flex; gap: 8px;">
              <button class="table-action-btn toggle-skip-btn ${isSkipped ? 'active-skip' : ''}" 
                      data-sno="${c.sno}" 
                      title="${isSkipped ? 'Include in queue' : 'Skip recipient'}">
                ${actionIcon}
              </button>
              <button class="table-action-btn load-preview-btn" data-sno="${c.sno}" title="Preview Email">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    // Bind Event Listeners on Table Buttons
    document.querySelectorAll('.toggle-skip-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const btnEl = e.currentTarget;
        const sno = parseInt(btnEl.getAttribute('data-sno'));
        const isSkipped = btnEl.classList.contains('active-skip');
        
        try {
          const response = await fetch('/api/contacts/toggle-skip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sno, skip: !isSkipped })
          });
          const data = await response.json();
          if (data.success) {
            // Update local state
            const target = appState.contacts.find(c => c.sno === sno);
            if (target) {
              target.status = !isSkipped ? 'skipped' : 'pending';
            }
            showToast(`Recipient #${sno} status updated.`, 'success');
            // Re-render
            runFilters();
          }
        } catch (err) {
          showToast('Failed to toggle skip.', 'error');
        }
      });
    });
    
    document.querySelectorAll('.load-preview-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sno = parseInt(e.currentTarget.getAttribute('data-sno'));
        const idx = appState.contacts.findIndex(c => c.sno === sno);
        if (idx !== -1) {
          appState.previewIndex = idx;
          updateLivePreview();
          // Switch to template screen
          document.querySelector('[data-target="screen-template"]').click();
        }
      });
    });
    
    renderPaginationControls();
  }

  function renderPaginationControls() {
    const totalPages = Math.ceil(appState.filteredContacts.length / appState.pageSize);
    
    btnPagePrev.disabled = appState.currentPage === 1;
    btnPageNext.disabled = appState.currentPage === totalPages || totalPages === 0;
    
    pageNumbersContainer.innerHTML = '';
    
    // Generate page links to avoid too many buttons (max 5)
    let startPage = Math.max(1, appState.currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.className = `page-number-btn ${i === appState.currentPage ? 'active' : ''}`;
      btn.textContent = i;
      btn.addEventListener('click', () => {
        appState.currentPage = i;
        renderRecipientsTable();
      });
      pageNumbersContainer.appendChild(btn);
    }
  }

  btnPagePrev.addEventListener('click', () => {
    if (appState.currentPage > 1) {
      appState.currentPage--;
      renderRecipientsTable();
    }
  });

  btnPageNext.addEventListener('click', () => {
    const totalPages = Math.ceil(appState.filteredContacts.length / appState.pageSize);
    if (appState.currentPage < totalPages) {
      appState.currentPage++;
      renderRecipientsTable();
    }
  });

  // --- EMAIL TEMPLATE COMPILED PREVIEW ---
  function compileTemplate(text, contact) {
    if (!text || !contact) return '';
    return text
      .replace(/{name}/gi, contact.name || '')
      .replace(/{email}/gi, contact.email || '')
      .replace(/{title}/gi, contact.title || '')
      .replace(/{company}/gi, contact.company || '')
      .replace(/{sno}/gi, contact.sno || '');
  }

  function updateLivePreview() {
    if (appState.contacts.length === 0) {
      previewToEmail.textContent = 'No recipients loaded';
      previewSubject.textContent = '';
      previewBodyContent.textContent = 'Please import contacts first.';
      lblPreviewRecipient.textContent = 'No contacts';
      return;
    }
    
    const contact = appState.contacts[appState.previewIndex];
    lblPreviewRecipient.textContent = `Recipient #${contact.sno} of ${appState.contacts.length}`;
    previewToEmail.textContent = `${contact.name} <${contact.email}>`;
    
    const subject = inputSubject.value;
    const body = textareaBody.value;
    
    previewSubject.textContent = compileTemplate(subject, contact);
    
    const compiledBody = compileTemplate(body, contact);
    // If it has HTML tags, render as HTML, else render as text with spacing
    const isHtml = /<[a-z][\s\S]*>/i.test(compiledBody);
    if (isHtml) {
      previewBodyContent.innerHTML = compiledBody;
    } else {
      previewBodyContent.textContent = compiledBody;
    }
  }

  // Tag helper injection logic
  tagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.getAttribute('data-tag');
      const startPos = textareaBody.selectionStart;
      const endPos = textareaBody.selectionEnd;
      
      const val = textareaBody.value;
      textareaBody.value = val.substring(0, startPos) + tag + val.substring(endPos, val.length);
      
      // Reset cursor position after insertion
      textareaBody.focus();
      textareaBody.selectionStart = textareaBody.selectionEnd = startPos + tag.length;
      
      updateLivePreview();
    });
  });

  textareaBody.addEventListener('input', updateLivePreview);
  inputSubject.addEventListener('input', updateLivePreview);

  btnPrevPreview.addEventListener('click', () => {
    if (appState.previewIndex > 0) {
      appState.previewIndex--;
      updateLivePreview();
    }
  });

  btnNextPreview.addEventListener('click', () => {
    if (appState.previewIndex < appState.contacts.length - 1) {
      appState.previewIndex++;
      updateLivePreview();
    }
  });

  // --- AUTOMATION STATUS POLLING & CONTROLS ---
  async function pollStatus() {
    if (appState.isPolling) return;
    appState.isPolling = true;
    
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      
      appState.status = data.status;
      appState.stats = data.stats;
      
      // Update Stats UI
      statTotal.textContent = data.stats.total;
      statSent.textContent = data.stats.sent;
      statFailed.textContent = data.stats.failed;
      statPending.textContent = data.stats.pending;
      
      // Update Progress Bar
      const totalProcessable = data.stats.total - data.stats.skipped;
      const processedCount = data.stats.sent + data.stats.failed;
      let progressPercent = 0;
      if (totalProcessable > 0) {
        progressPercent = Math.min(100, Math.round((processedCount / totalProcessable) * 100));
      }
      
      document.getElementById('queue-progress-fill').style.width = `${progressPercent}%`;
      document.getElementById('queue-progress-text').textContent = `${progressPercent}% Completed (${processedCount}/${totalProcessable})`;
      
      // Update Status Labels
      updateStatusUI(data.status);
      
      // Render Terminal Logs
      renderLogs(data.logs);
      
    } catch (e) {
      console.error('Error polling status:', e);
    } finally {
      appState.isPolling = false;
    }
  }

  function updateStatusUI(status) {
    serverDot.className = 'status-indicator-dot ' + status;
    
    if (status === 'sending') {
      serverStatusText.textContent = 'Active (Sending)';
      serverStatusText.style.color = 'var(--status-sent)';
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnReset.disabled = true;
      
      // Increase polling frequency during transmission
      adjustPollingSpeed(1000);
    } else if (status === 'paused') {
      serverStatusText.textContent = 'Paused';
      serverStatusText.style.color = 'var(--status-pending)';
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnReset.disabled = false;
      
      adjustPollingSpeed(3000);
    } else {
      serverStatusText.textContent = 'Stopped';
      serverStatusText.style.color = 'var(--status-failed)';
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnReset.disabled = false;
      
      adjustPollingSpeed(4000);
    }
  }

  function renderLogs(logs) {
    if (!logs || logs.length === 0) return;
    
    // We reverse logs because in backend we unshift (newest first) but in terminal we want oldest first (scrolling down)
    const lines = [...logs].reverse();
    
    terminalLogs.innerHTML = lines.map(line => {
      let logClass = 'system-line';
      if (line.includes('SUCCESS:')) logClass = 'success-line';
      else if (line.includes('FAILURE:')) logClass = 'error-line';
      else if (line.includes('Waiting')) logClass = 'warning-line';
      
      return `<div class="terminal-line ${logClass}">${escapeHtml(line)}</div>`;
    }).join('');
    
    // Auto Scroll Terminal to bottom
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  function startStatusPolling(intervalMs) {
    pollStatus();
    appState.pollInterval = setInterval(pollStatus, intervalMs);
  }

  function adjustPollingSpeed(newIntervalMs) {
    if (appState.pollInterval) {
      clearInterval(appState.pollInterval);
    }
    appState.pollInterval = setInterval(pollStatus, newIntervalMs);
  }

  // Control button actions
  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    try {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        showToast('Bulk automation queue started.', 'success');
        pollStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      btnStart.disabled = false;
      showToast(err.message, 'error');
    }
  });

  btnPause.addEventListener('click', async () => {
    btnPause.disabled = true;
    try {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' })
      });
      if (response.ok) {
        showToast('Automation campaign paused.', 'info');
        pollStatus();
        loadContacts(); // reload status changes
      }
    } catch (err) {
      btnPause.disabled = false;
      showToast('Error pausing queue.', 'error');
    }
  });

  btnReset.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all email send statuses? This will allow you to resend emails to everyone.')) {
      return;
    }
    
    btnReset.disabled = true;
    try {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      if (response.ok) {
        showToast('Campaign sending progress has been reset.', 'success');
        pollStatus();
        loadContacts(); // reload status changes
      }
    } catch (err) {
      showToast('Error resetting queue.', 'error');
    } finally {
      btnReset.disabled = false;
    }
  });

  // Delay Slider
  sliderDelay.addEventListener('input', () => {
    const val = sliderDelay.value;
    badgeDelay.textContent = `${val}s`;
  });

  sliderDelay.addEventListener('change', async () => {
    const delayMs = parseInt(sliderDelay.value) * 1000;
    
    // Save locally and send to server
    const settings = { ...appState.settings };
    settings.delay = delayMs;
    
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (data.success) {
        appState.settings = data.settings;
        showToast(`Delay interval updated to ${sliderDelay.value}s`, 'success');
      }
    } catch (e) {
      showToast('Failed to update delay on server.', 'error');
    }
  });

  // --- HELPERS ---
  function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
