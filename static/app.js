/**
 * LeadGen Studio — Interactive Frontend Logic
 * Version 2.0.0
 */

// Application State
const state = {
  activeTab: 'tab-overview',
  query: 'fintech SaaS startups India',
  maxLeads: 3,
  completenessThreshold: 0.6,
  customValueProps: [],
  isRunning: false,
  elapsedSeconds: 0,
  timerInterval: null,
  currentResults: [],
  currentNotes: [],
  history: JSON.parse(localStorage.getItem('leadgen_history') || '[]'),
};

// Target FastAPI backend on port 8000 if frontend is opened on a static server (e.g. VS Code Live Server on :5500)
const API_BASE = (window.location.protocol.startsWith('http') && window.location.port !== '8000')
  ? 'http://127.0.0.1:8000'
  : '';

// DOM Elements
const el = {
  // Header
  healthStatusBadge: document.getElementById('healthStatusBadge'),

  // Tabs
  navTabs: document.querySelectorAll('.nav-tab'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  historyCountBadge: document.getElementById('historyCountBadge'),

  // Discovery Controls
  queryInput: document.getElementById('queryInput'),
  btnClearQuery: document.getElementById('btnClearQuery'),
  btnLaunchPipeline: document.getElementById('btnLaunchPipeline'),
  btnLaunchText: document.getElementById('btnLaunchText'),
  presetBtns: document.querySelectorAll('.preset-btn'),
  btnToggleControls: document.getElementById('btnToggleControls'),
  advancedControlsPanel: document.getElementById('advancedControlsPanel'),
  controlsSummaryPill: document.getElementById('controlsSummaryPill'),
  maxLeadsInput: document.getElementById('maxLeadsInput'),
  maxLeadsVal: document.getElementById('maxLeadsVal'),
  completenessThresholdInput: document.getElementById('completenessThresholdInput'),
  completenessThresholdVal: document.getElementById('completenessThresholdVal'),
  activePropsSummaryList: document.getElementById('activePropsSummaryList'),
  btnGoToValueProps: document.getElementById('btnGoToValueProps'),

  // Pipeline Flow & Tracker
  pipelineTrackerCard: document.getElementById('pipelineTrackerCard'),
  pipelineElapsedTime: document.getElementById('pipelineElapsedTime'),
  consoleLogs: document.getElementById('consoleLogs'),
  btnClearLogs: document.getElementById('btnClearLogs'),

  // Results Deck
  resultsSummaryBar: document.getElementById('resultsSummaryBar'),
  statLeadsCount: document.getElementById('statLeadsCount'),
  statAvgCompleteness: document.getElementById('statAvgCompleteness'),
  statPainPointsMatched: document.getElementById('statPainPointsMatched'),
  statDraftsReady: document.getElementById('statDraftsReady'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  btnExportJson: document.getElementById('btnExportJson'),
  pipelineNotesCallout: document.getElementById('pipelineNotesCallout'),
  pipelineNotesList: document.getElementById('pipelineNotesList'),
  leadsCardsContainer: document.getElementById('leadsCardsContainer'),

  // Single URL
  singleUrlInput: document.getElementById('singleUrlInput'),
  btnAnalyzeSingleUrl: document.getElementById('btnAnalyzeSingleUrl'),
  btnAnalyzeUrlText: document.getElementById('btnAnalyzeUrlText'),
  sampleUrlBtns: document.querySelectorAll('.sample-url-btn'),
  singleUrlResultsContainer: document.getElementById('singleUrlResultsContainer'),

  // Value Props Studio
  newPropInput: document.getElementById('newPropInput'),
  btnAddProp: document.getElementById('btnAddProp'),
  valuePropsList: document.getElementById('valuePropsList'),
  btnSaveProps: document.getElementById('btnSaveProps'),
  btnResetProps: document.getElementById('btnResetProps'),

  // History
  historyListContainer: document.getElementById('historyListContainer'),
  btnClearHistory: document.getElementById('btnClearHistory'),

  // Toast
  toastContainer: document.getElementById('toastContainer'),
};

// Default Value Propositions Fallback
const DEFAULT_VALUE_PROPS = [
  "manual lead research takes the sales team too long",
  "outreach emails are generic and get low reply rates",
  "no visibility into which companies are actually a good fit before reaching out",
  "existing tools are too expensive/complex for a small team"
];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  updateHistoryBadge();
  await checkHealth();
  await loadValueProps();
});

// --- Event Listeners ---
function initEventListeners() {
  // Navigation Tabs
  el.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Query Controls
  el.btnClearQuery?.addEventListener('click', () => {
    el.queryInput.value = '';
    el.queryInput.focus();
  });

  el.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      el.queryInput.value = q;
      showToast(`Selected ICP: ${q}`, 'info');
    });
  });

  // Toggle Advanced Controls
  el.btnToggleControls?.addEventListener('click', () => {
    const isHidden = el.advancedControlsPanel.classList.toggle('hidden');
    el.btnToggleControls.classList.toggle('expanded', !isHidden);
  });

  // Sliders
  el.maxLeadsInput?.addEventListener('input', (e) => {
    state.maxLeads = parseInt(e.target.value, 10);
    el.maxLeadsVal.textContent = `${state.maxLeads} Leads`;
    updateControlsSummary();
  });

  el.completenessThresholdInput?.addEventListener('input', (e) => {
    state.completenessThreshold = parseFloat(e.target.value);
    el.completenessThresholdVal.textContent = state.completenessThreshold.toFixed(2);
    updateControlsSummary();
  });

  el.btnGoToValueProps?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('tab-value-props');
  });

  // Pipeline Execution Launch
  el.btnLaunchPipeline?.addEventListener('click', handleLaunchPipeline);
  el.btnClearLogs?.addEventListener('click', () => {
    el.consoleLogs.innerHTML = '<div class="log-line log-info">[Console cleared]</div>';
  });

  // Single URL Analyzer
  el.btnAnalyzeSingleUrl?.addEventListener('click', handleAnalyzeSingleUrl);
  el.sampleUrlBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.singleUrlInput.value = btn.getAttribute('data-url');
    });
  });

  // Value Props Studio
  el.btnAddProp?.addEventListener('click', handleAddProp);
  el.newPropInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddProp();
  });
  el.btnSaveProps?.addEventListener('click', handleSaveProps);
  el.btnResetProps?.addEventListener('click', handleResetProps);

  // History Actions
  el.btnClearHistory?.addEventListener('click', handleClearHistory);

  // Export Buttons
  el.btnExportCsv?.addEventListener('click', () => exportResultsAs('csv'));
  el.btnExportJson?.addEventListener('click', () => exportResultsAs('json'));

}

// --- Tab Switching ---
function switchTab(tabId) {
  state.activeTab = tabId;
  el.navTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabId));
  el.tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === tabId));

  if (tabId === 'tab-history') {
    renderHistoryView();
  }
}

// --- Health Check ---
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('API offline');
    const data = await res.json();
    
    const isGroqConfigured = data.groq_api_key_configured;
    
    el.healthStatusBadge.className = 'status-badge ' + (isGroqConfigured ? 'status-connected' : 'status-ready');
    el.healthStatusBadge.innerHTML = `
      <span class="status-dot"></span>
      <span class="status-text">${isGroqConfigured ? 'Groq Llama 3.3 Connected' : 'Engine Ready (Heuristic/Demo)'}</span>
    `;
  } catch (err) {
    el.healthStatusBadge.className = 'status-badge status-loading';
    el.healthStatusBadge.innerHTML = `
      <span class="status-dot" style="background:#f43f5e"></span>
      <span class="status-text">Backend Offline (Run: uvicorn main:app --reload)</span>
    `;
  }
}

// --- Value Propositions Management ---
async function loadValueProps() {
  try {
    const res = await fetch(`${API_BASE}/config/value-props`);
    if (res.ok) {
      const data = await res.json();
      state.customValueProps = data.value_props || DEFAULT_VALUE_PROPS;
    } else {
      state.customValueProps = DEFAULT_VALUE_PROPS;
    }
  } catch {
    state.customValueProps = DEFAULT_VALUE_PROPS;
  }
  renderValuePropsSummary();
  renderValuePropsEditor();
}

function renderValuePropsSummary() {
  if (!el.activePropsSummaryList) return;
  el.activePropsSummaryList.innerHTML = state.customValueProps.map(p => `
    <span class="prop-pill-mini" title="${escapeHtml(p)}">🎯 ${escapeHtml(p)}</span>
  `).join('');
}

function renderValuePropsEditor() {
  if (!el.valuePropsList) return;
  el.valuePropsList.innerHTML = state.customValueProps.map((prop, idx) => `
    <div class="prop-editor-item">
      <span class="prop-item-text"><strong>#${idx + 1}</strong> ${escapeHtml(prop)}</span>
      <button class="btn-delete-prop" onclick="deleteProp(${idx})" title="Remove proposition">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `).join('');
}

window.deleteProp = function(index) {
  state.customValueProps.splice(index, 1);
  renderValuePropsSummary();
  renderValuePropsEditor();
};

function handleAddProp() {
  const val = el.newPropInput.value.trim();
  if (!val) return;
  state.customValueProps.push(val);
  el.newPropInput.value = '';
  renderValuePropsSummary();
  renderValuePropsEditor();
  showToast('Proposition added to memory.', 'info');
}

async function handleSaveProps() {
  try {
    const res = await fetch(`${API_BASE}/config/value-props`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value_props: state.customValueProps })
    });
    if (res.ok) {
      showToast('Value propositions updated successfully!', 'success');
      renderValuePropsSummary();
    } else {
      throw new Error('Failed to update value props');
    }
  } catch (err) {
    showToast('Failed to save to backend, kept in local session.', 'warning');
  }
}

function handleResetProps() {
  state.customValueProps = [...DEFAULT_VALUE_PROPS];
  renderValuePropsSummary();
  renderValuePropsEditor();
  showToast('Reset to default value propositions.', 'info');
}

function updateControlsSummary() {
  if (el.controlsSummaryPill) {
    el.controlsSummaryPill.textContent = `${state.maxLeads} Leads · ${state.completenessThreshold.toFixed(2)} Min Completeness`;
  }
}

// --- Pipeline Progress Simulator & State Machine ---
const PIPELINE_STEPS = [
  { id: 'search', title: '1. Search & Rank', desc: 'Querying DuckDuckGo DDGS & ranking candidates' },
  { id: 'scrape', title: '2. Playwright Scrape', desc: 'Headless Chromium crawl & Trafilatura markdown clean' },
  { id: 'score', title: '3. Data Completeness', desc: 'Computing weighted field coverage' },
  { id: 'match', title: '4. Pain Point Match', desc: 'Checking alignment vs active Value Propositions' },
  { id: 'draft', title: '5. Cold Email Draft', desc: 'Composing concise, personalized email (<120 words)' },
  { id: 'critique', title: '6. Self-Critique', desc: 'Validating single ask, length & specific facts' },
];

function resetPipelineNodes() {
  PIPELINE_STEPS.forEach((step, idx) => {
    const node = document.getElementById(`node-${step.id}`);
    const statusText = document.getElementById(`status-text-${step.id}`);
    const conn = document.getElementById(`conn-${idx + 1}`);

    if (node) node.className = 'flow-node';
    if (statusText) statusText.textContent = 'Pending';
    if (conn) conn.className = 'flow-connector';
  });
}

function updatePipelineStep(stepIndex, stateType, customText) {
  // stateType: 'running' | 'completed' | 'failed'
  const step = PIPELINE_STEPS[stepIndex];
  if (!step) return;

  const node = document.getElementById(`node-${step.id}`);
  const statusText = document.getElementById(`status-text-${step.id}`);
  const conn = document.getElementById(`conn-${stepIndex + 1}`);

  if (node) {
    node.className = `flow-node ${stateType}`;
  }
  if (statusText) {
    statusText.textContent = customText || (stateType === 'running' ? 'Active...' : (stateType === 'completed' ? 'Done' : 'Failed'));
  }
  if (conn && stateType === 'completed') {
    conn.classList.add('completed');
  }
}

function logToConsole(message, type = 'info') {
  if (!el.consoleLogs) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${time}] ${message}`;
  el.consoleLogs.appendChild(line);
  el.consoleLogs.scrollTop = el.consoleLogs.scrollHeight;
}

function startTimer() {
  state.elapsedSeconds = 0;
  el.pipelineElapsedTime.textContent = `Elapsed: 0s`;
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    el.pipelineElapsedTime.textContent = `Elapsed: ${state.elapsedSeconds}s`;
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

// --- Main Pipeline Execution ---
async function handleLaunchPipeline() {
  if (state.isRunning) return;

  const query = el.queryInput.value.trim();
  if (!query) {
    showToast('Please enter an ICP search query first.', 'error');
    el.queryInput.focus();
    return;
  }

  state.isRunning = true;
  el.btnLaunchPipeline.disabled = true;
  el.btnLaunchText.textContent = 'Processing Pipeline...';
  el.pipelineTrackerCard.classList.remove('hidden');
  el.pipelineNotesCallout.classList.add('hidden');
  resetPipelineNodes();
  startTimer();

  logToConsole(`Launching outbound lead discovery for: "${query}"`, 'info');
  logToConsole(`Parameters: max_leads=${state.maxLeads}, completeness_threshold=${state.completenessThreshold.toFixed(2)}`, 'info');

  // Node 1: Search & Rank
  updatePipelineStep(0, 'running', 'Searching DDGS...');
  logToConsole('Initiating DuckDuckGo candidate URL discovery...', 'info');

  // Interval simulation to keep visual feedback vibrant while backend works
  let stepIdx = 0;
  const stepTimer = setInterval(() => {
    if (stepIdx < PIPELINE_STEPS.length - 1) {
      updatePipelineStep(stepIdx, 'completed');
      stepIdx++;
      updatePipelineStep(stepIdx, 'running');
      logToConsole(`Executing: ${PIPELINE_STEPS[stepIdx].desc}`, 'info');
    }
  }, 3500);

  try {
    const payload = {
      query: query,
      max_leads: state.maxLeads,
      completeness_threshold: state.completenessThreshold,
      custom_value_props: state.customValueProps
    };

    const res = await fetch(`${API_BASE}/leads/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    clearInterval(stepTimer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Pipeline execution failed' }));
      throw new Error(err.detail || 'Request failed');
    }

    const data = await res.json();
    stopTimer();

    // Mark all steps complete
    PIPELINE_STEPS.forEach((_, idx) => updatePipelineStep(idx, 'completed'));
    logToConsole(`Pipeline complete! Successfully produced ${data.results.length} enriched leads.`, 'success');

    state.currentResults = data.results || [];
    state.currentNotes = data.notes || [];

    // Render results
    renderResultsDeck(data.results, data.notes);

    // Save to History
    saveToHistory(query, data.results);

    showToast(`Discovered ${data.results.length} qualified leads!`, 'success');

  } catch (err) {
    clearInterval(stepTimer);
    stopTimer();
    updatePipelineStep(stepIdx, 'failed', 'Error');
    const isLikelyNetwork = err.name === 'TypeError' || err.message.includes('405') || err.message.includes('Failed to fetch');
    const displayMsg = isLikelyNetwork
      ? 'Cannot connect to backend. Please ensure the server is running (`uvicorn main:app --reload`) on http://127.0.0.1:8000.'
      : err.message;
    logToConsole(`Pipeline Error: ${displayMsg}`, 'error');
    showToast(displayMsg, 'error');
  } finally {
    state.isRunning = false;
    el.btnLaunchPipeline.disabled = false;
    el.btnLaunchText.textContent = 'Run Pipeline';
  }
}

// --- Single URL Direct Analyzer ---
async function handleAnalyzeSingleUrl() {
  const url = el.singleUrlInput.value.trim();
  if (!url) {
    showToast('Please enter a target company URL.', 'error');
    return;
  }

  el.btnAnalyzeSingleUrl.disabled = true;
  el.btnAnalyzeUrlText.textContent = 'Analyzing Site...';
  el.singleUrlResultsContainer.innerHTML = `
    <div class="glass-card" style="text-align:center; padding: 2.5rem;">
      <div class="pulse-indicator" style="margin: 0 auto 1rem auto; width: 16px; height: 16px;"></div>
      <h3>Scraping and analyzing ${escapeHtml(url)}...</h3>
      <p style="color:var(--text-muted); font-size:0.9rem; margin-top:0.4rem;">Headless Playwright is extracting company data, measuring field completeness, and drafting outreach.</p>
    </div>
  `;

  try {
    const payload = {
      url: url,
      completeness_threshold: state.completenessThreshold,
      custom_value_props: state.customValueProps
    };

    const res = await fetch(`${API_BASE}/leads/analyze-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Analysis failed' }));
      throw new Error(err.detail || 'Analysis failed');
    }

    const data = await res.json();
    if (data.result) {
      el.singleUrlResultsContainer.innerHTML = `
        <div style="margin-bottom: 1rem;">
          <h3 style="color:var(--text-main); margin-bottom: 0.25rem;">Direct URL Analysis Result</h3>
          <p style="color:var(--text-muted); font-size:0.85rem;">Target: <code>${escapeHtml(url)}</code></p>
        </div>
        ${createLeadCardHtml(data.result, 0)}
      `;
      saveToHistory(`Direct: ${url}`, [data.result]);
      showToast('Single URL analysis complete!', 'success');
    } else {
      el.singleUrlResultsContainer.innerHTML = `
        <div class="glass-card" style="text-align:center; padding: 2.5rem;">
          <h3 style="color:#f87171;">Could not analyze URL</h3>
          <p style="color:var(--text-muted); font-size:0.9rem; margin-top:0.5rem;">Notes: ${escapeHtml((data.notes || []).join(', '))}</p>
        </div>
      `;
    }
  } catch (err) {
    const isLikelyNetwork = err.name === 'TypeError' || err.message.includes('405') || err.message.includes('Failed to fetch');
    const displayMsg = isLikelyNetwork
      ? 'Cannot connect to backend. Please ensure the server is running (`uvicorn main:app --reload`) on http://127.0.0.1:8000.'
      : err.message;
    el.singleUrlResultsContainer.innerHTML = `
      <div class="glass-card" style="text-align:center; padding: 2rem; border-color: rgba(244,63,94,0.4);">
        <h3 style="color:#f87171;">Analysis Failed</h3>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:0.5rem;">${escapeHtml(displayMsg)}</p>
      </div>
    `;
    showToast(displayMsg, 'error');
  } finally {
    el.btnAnalyzeSingleUrl.disabled = false;
    el.btnAnalyzeUrlText.textContent = 'Analyze URL';
  }
}

// --- Render Results Deck ---
function renderResultsDeck(results, notes) {
  if (!results || results.length === 0) {
    el.resultsSummaryBar.classList.add('hidden');
    el.leadsCardsContainer.innerHTML = `
      <div class="empty-state-card glass-card">
        <h3>No Leads Found for Query</h3>
        <p>DuckDuckGo could not find active candidate company pages matching this exact query, or all sites were below the threshold. Try adjusting the query or lowering the completeness threshold.</p>
      </div>
    `;
    return;
  }

  // Summary Metrics
  const leadsCount = results.length;
  const avgConf = Math.round(
    (results.reduce((acc, r) => acc + (r.lead.completeness_score || 0), 0) / leadsCount) * 100
  );
  const matchedPointsCount = results.reduce(
    (acc, r) => acc + (r.matched_pain_points?.length || 0), 0
  );
  const draftsCount = results.filter(r => r.draft_email).length;

  el.statLeadsCount.textContent = leadsCount;
  el.statAvgCompleteness.textContent = `${avgConf}%`;
  el.statPainPointsMatched.textContent = matchedPointsCount;
  el.statDraftsReady.textContent = draftsCount;
  el.resultsSummaryBar.classList.remove('hidden');

  // Pipeline Notes Callout
  if (notes && notes.length > 0) {
    el.pipelineNotesList.innerHTML = notes.map(n => `<li>${escapeHtml(n)}</li>`).join('');
    el.pipelineNotesCallout.classList.remove('hidden');
  } else {
    el.pipelineNotesCallout.classList.add('hidden');
  }

  // Cards
  el.leadsCardsContainer.innerHTML = results.map((r, idx) => createLeadCardHtml(r, idx)).join('');
}

// --- HTML Template for Lead Card ---
function createLeadCardHtml(item, index) {
  const lead = item.lead || {};
  const painPoints = item.matched_pain_points || [];
  const draftEmail = item.draft_email;
  const conf = lead.completeness_score || 0;
  const confPct = Math.round(conf * 100);

  let confClass = 'conf-high';
  if (conf < 0.5) confClass = 'conf-low';
  else if (conf < 0.75) confClass = 'conf-mid';

  const companyName = lead.company_name || 'Unidentified Company';
  const website = lead.website_url || lead.source_url || '#';
  const depthUsed = lead.scrape_depth_used === 1 ? 'Depth 1 (Deep Subpages)' : 'Depth 0 (Homepage)';

  const firmographics = [
    lead.industry ? `<span>Industry: <strong>${escapeHtml(lead.industry)}</strong></span>` : '',
    lead.location ? `<span>Location: <strong>${escapeHtml(lead.location)}</strong></span>` : '',
    lead.company_size ? `<span>Size: <strong>${escapeHtml(lead.company_size)}</strong></span>` : '',
    lead.funding_stage ? `<span>Funding: <strong>${escapeHtml(lead.funding_stage)}</strong></span>` : '',
    lead.founder_name ? `<span>Founder: <strong>${escapeHtml(lead.founder_name)}</strong></span>` : '',
    lead.contact_email ? `<span>Email: <strong>${escapeHtml(lead.contact_email)}</strong></span>` : '',
  ].filter(Boolean);

  const missingFields = lead.fields_missing || [];

  return `
    <div class="lead-card" id="lead-card-${index}">
      <div class="lead-card-header">
        <div class="lead-title-area">
          <div class="lead-company-name">
            ${escapeHtml(companyName)}
          </div>
          <a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" class="lead-website-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            ${escapeHtml(website)}
          </a>
        </div>

        <div class="lead-header-badges">
          <span class="depth-badge">${depthUsed}</span>
          <div class="confidence-badge-pill ${confClass}" title="Data completeness score">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
            ${confPct}% Complete
          </div>
        </div>
      </div>

      <!-- Firmographics Row -->
      ${firmographics.length > 0 ? `
        <div class="firmographics-row">
          ${firmographics.map(f => `<div class="firmo-pill">${f}</div>`).join('')}
        </div>
      ` : ''}

      <!-- Description Box -->
      ${lead.product_description ? `
        <div class="lead-description-box">
          <div class="lead-desc-label">Company Focus & Value Narrative</div>
          <div>${escapeHtml(lead.product_description)}</div>
        </div>
      ` : ''}

      <!-- Matched Pain Points -->
      ${painPoints.length > 0 ? `
        <div class="matched-pain-points-area">
          <div class="section-subheading">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle></svg>
            Matched Value Props & Pain Points (${painPoints.length})
          </div>
          <div class="pain-point-tags">
            ${painPoints.map(p => `<span class="pain-point-tag">🎯 ${escapeHtml(p)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Outreach Cold Email Draft -->
      ${draftEmail ? `
        <div class="outreach-email-card">
          <div class="email-header-bar">
            <div class="email-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              AI Tailored Outreach Draft (Critiqued & Validated)
            </div>
            <div class="email-actions">
              <button class="btn-copy-email" onclick="copyEmailDraft(${index})" id="btn-copy-${index}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy Draft
              </button>
            </div>
          </div>
          <div class="email-body-content" id="email-content-${index}">${escapeHtml(draftEmail)}</div>
        </div>
      ` : `
        <div class="outreach-email-card" style="padding: 0.9rem; color: var(--text-dim); font-size: 0.82rem;">
          No outreach draft generated (requires company name and at least one matched pain point).
        </div>
      `}

      <!-- Diagnostic Metadata Footer -->
      <div class="lead-diag-footer">
        <div>Scraped at: ${new Date(lead.scraped_at || Date.now()).toLocaleTimeString()}</div>
        ${missingFields.length > 0 ? `
          <div>Missing fields: <span class="missing-fields-pill">${missingFields.join(', ')}</span></div>
        ` : `
          <div style="color:#34d399;">✓ Complete data profile</div>
        `}
      </div>
    </div>
  `;
}

// --- Copy Email to Clipboard ---
window.copyEmailDraft = function(index) {
  const contentEl = document.getElementById(`email-content-${index}`);
  const btn = document.getElementById(`btn-copy-${index}`);
  if (!contentEl) return;

  const text = contentEl.innerText || contentEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = `✓ Copied!`;
      setTimeout(() => { btn.innerHTML = original; }, 2000);
    }
    showToast('Outreach draft copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
};

// --- History & Persistence ---
function saveToHistory(query, results) {
  if (!results || results.length === 0) return;
  const entry = {
    id: 'run_' + Date.now(),
    timestamp: new Date().toISOString(),
    query: query,
    resultsCount: results.length,
    results: results
  };

  state.history.unshift(entry);
  if (state.history.length > 30) state.history.pop();
  localStorage.setItem('leadgen_history', JSON.stringify(state.history));
  updateHistoryBadge();
}

function updateHistoryBadge() {
  if (el.historyCountBadge) {
    el.historyCountBadge.textContent = state.history.length;
  }
}

function renderHistoryView() {
  if (!el.historyListContainer) return;
  if (state.history.length === 0) {
    el.historyListContainer.innerHTML = `
      <div class="empty-state-card glass-card">
        <p>No saved leads in local history yet. Run a discovery query or analyze a URL.</p>
      </div>
    `;
    return;
  }

  el.historyListContainer.innerHTML = state.history.map((h, idx) => `
    <div class="glass-card" style="padding: 1.25rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
        <div>
          <h4 style="color:var(--text-main); font-size:1.05rem;">${escapeHtml(h.query)}</h4>
          <span style="font-size:0.75rem; color:var(--text-dim);">${new Date(h.timestamp).toLocaleString()} · ${h.resultsCount} leads</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="loadHistoryRun(${idx})">Load Results</button>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        ${(h.results || []).map(r => `
          <span class="chip" style="font-size:0.75rem;">🏢 ${escapeHtml(r.lead?.company_name || 'Company')} (${Math.round((r.lead?.completeness_score || 0) * 100)}%)</span>
        `).join('')}
      </div>
    </div>
  `).join('');
}

window.loadHistoryRun = function(index) {
  const item = state.history[index];
  if (!item) return;
  state.currentResults = item.results;
  switchTab('tab-discovery');
  el.queryInput.value = item.query;
  renderResultsDeck(item.results, []);
  showToast(`Loaded ${item.results.length} leads from history.`, 'info');
};

function handleClearHistory() {
  if (confirm('Clear all stored lead history?')) {
    state.history = [];
    localStorage.removeItem('leadgen_history');
    updateHistoryBadge();
    renderHistoryView();
    showToast('History cleared.', 'info');
  }
}

// --- Export Functions ---
function exportResultsAs(format) {
  const leads = state.currentResults;
  if (!leads || leads.length === 0) {
    showToast('No leads available to export. Run a pipeline first!', 'error');
    return;
  }

  if (format === 'json') {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(leads, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `leadgen_export_${Date.now()}.json`);
    dlAnchorElem.click();
    showToast('Exported JSON dataset.', 'success');
  } else if (format === 'csv') {
    const headers = [
      'Company Name',
      'Website URL',
      'Industry',
      'Location',
      'Company Size',
      'Funding Stage',
      'Founder Name',
      'Contact Email',
      'Completeness Score',
      'Matched Pain Points',
      'Email Draft'
    ];

    const rows = leads.map(r => {
      const l = r.lead || {};
      return [
        l.company_name || '',
        l.website_url || '',
        l.industry || '',
        l.location || '',
        l.company_size || '',
        l.funding_stage || '',
        l.founder_name || '',
        l.contact_email || '',
        l.completeness_score || 0,
        (r.matched_pain_points || []).join('; '),
        (r.draft_email || '').replace(/"/g, '""')
      ].map(val => `"${val}"`).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent([headers.join(','), ...rows].join('\n'));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", csvContent);
    dlAnchorElem.setAttribute("download", `leadgen_leads_${Date.now()}.csv`);
    dlAnchorElem.click();
    showToast('Exported CSV dataset.', 'success');
  }
}

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  if (!el.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// --- Utility ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
