import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const DEMO_MODE = Boolean(window.PIPELINE_DEMO);
const HISTORY_DAYS = 1;
const LOCAL_STATE_VERSION = 7;
const GO_LIVE_DATE = '2026-06-08';
const STAGE_META = [
  {
    slug: 'tiktok-ads',
    name: 'TikTok Ads',
    owner: 'Nicolas',
    blockerText: 'Nenhum novo tráfego entra no pipeline. Os demais elos ficam dependentes de bases já existentes.',
    isActive: false,
    position: 0
  },
  {
    slug: 'landing',
    name: 'Landing',
    owner: 'Jeff',
    blockerText: 'O tráfego chega, mas a pessoa não encontra o caminho claro para entrar na comunidade.',
    isActive: false,
    position: 1
  },
  {
    slug: 'discord',
    name: 'Discord',
    owner: 'Nicolas / Murilo',
    blockerText: 'Pessoas entram no Discord, mas não entendem regras, próximos passos ou onde participar.',
    isActive: false,
    position: 2
  },
  {
    slug: 'plugin',
    name: 'Plugin',
    owner: 'Jeff',
    blockerText: 'A pessoa entra no Discord, mas não ativa o plugin de inspeção Roblox. Sem isso, perdemos a métrica inicial de creators.',
    isActive: false,
    position: 3
  },
  {
    slug: 'programacao',
    name: 'Programação',
    owner: 'Nicolas',
    blockerText: 'A comunidade perde motivo para retornar, conversar e participar depois da entrada inicial.',
    isActive: false,
    position: 4
  }
];

const seedHistory = [];

const seedAssets = [];

const seedStatusEvents = [];

const fmtFull = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const fmtDay = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const realTodayKey = toDateKey(new Date());
const todayKey = realTodayKey < GO_LIVE_DATE ? GO_LIVE_DATE : realTodayKey;
const todayDate = new Date(`${todayKey}T12:00:00`);
const storageKey = DEMO_MODE ? 'pipeline-roblox-demo-state' : 'pipeline-roblox-state';
const demoData = createDemoData(todayKey);

const state = {
  stages: [],
  history: [],
  assets: [],
  statusEvents: [],
  updateDraft: { stageSlug: null, date: todayKey, originalDate: todayKey },
  assetDraft: { id: null },
  supabaseReady: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
  storageMode: 'local'
};

const supabase = state.supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const assetMetricSaveTimers = new Map();

const els = {
  stageBand: document.getElementById('stageBand'),
  blockerBand: document.getElementById('blockerBand'),
  historyScroll: document.getElementById('history-scroll'),
  updateBackdrop: document.getElementById('updateBackdrop'),
  updateModalMode: document.getElementById('updateModalMode'),
  updateModalTitle: document.getElementById('updateModalTitle'),
  updateDate: document.getElementById('updateDate'),
  skipCheck: document.getElementById('skipCheck'),
  updateFields: document.getElementById('updateFields'),
  updateText: document.getElementById('updateText'),
  updateLink: document.getElementById('updateLink'),
  assetActionBar: document.getElementById('assetActionBar'),
  assetBackdrop: document.getElementById('assetBackdrop'),
  assetModalMode: document.getElementById('assetModalMode'),
  assetModalTitle: document.getElementById('assetModalTitle'),
  assetTitle: document.getElementById('assetTitle'),
  assetLink: document.getElementById('assetLink'),
  assetNote: document.getElementById('assetNote'),
  assetBody: document.getElementById('assetBody'),
  footerDate: document.getElementById('footerDate'),
  syncBadge: document.getElementById('syncBadge')
};

boot();

async function boot() {
  els.footerDate.textContent = fmtFull.format(todayDate);
  bindEvents();
  await loadData();
  render();
  updateStickyOffsets();
  window.addEventListener('resize', updateStickyOffsets);
}

function bindEvents() {
  document.getElementById('closeUpdate').addEventListener('click', closeUpdateModal);
  els.updateBackdrop.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeUpdateModal();
  });
  els.skipCheck.addEventListener('change', syncUpdateSkipUi);
  document.getElementById('saveUpdate').addEventListener('click', saveHistoryFromModal);

  document.getElementById('openAssetModal').addEventListener('click', () => openAssetModal());
  document.getElementById('closeAssetModal').addEventListener('click', closeAssetModal);
  els.assetBackdrop.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeAssetModal();
  });
  document.getElementById('saveAsset').addEventListener('click', saveAssetFromModal);
}

async function loadData() {
  if (DEMO_MODE) {
    hydrateDemoState();
    updateSyncBadge('Demo', 'online');
    return;
  }

  const local = loadLocalState();
  if (!local) saveLocalState({
    stages: structuredClone(STAGE_META),
    history: structuredClone(seedHistory),
    assets: structuredClone(seedAssets),
    statusEvents: structuredClone(seedStatusEvents)
  });

  if (!supabase) {
    hydrateFromLocal();
    updateSyncBadge('Modo local', 'local');
    return;
  }

  try {
    const [stagesResp, historyResp, assetsResp, eventsResp] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('position', { ascending: true }),
      supabase.from('pipeline_history').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('pipeline_assets').select('*').order('published_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('pipeline_stage_status_events').select('*').order('changed_at', { ascending: false })
    ]);

    const hasTables =
      !stagesResp.error &&
      !historyResp.error &&
      !assetsResp.error &&
      !eventsResp.error;

    if (!hasTables) {
      throw stagesResp.error || historyResp.error || assetsResp.error || eventsResp.error;
    }

    if (!stagesResp.data.length) {
      await seedSupabase();
      return loadData();
    }

    state.stages = stagesResp.data.map(normalizeStage).sort((a, b) => a.position - b.position);
    state.history = historyResp.data.map(normalizeHistory);
    state.assets = assetsResp.data.map(normalizeAsset);
    state.statusEvents = eventsResp.data.map(normalizeStatusEvent);
    state.storageMode = 'supabase';
    applyBusinessDefaults();
    updateSyncBadge('Supabase conectado', 'online');
  } catch (error) {
    console.error(error);
    hydrateFromLocal();
    updateSyncBadge('Falha no Supabase, usando local', 'error');
  }
}

function hydrateFromLocal() {
  const local = loadLocalState();
  state.stages = (local?.stages || structuredClone(STAGE_META)).map(normalizeStage).sort((a, b) => a.position - b.position);
  state.history = (local?.history || structuredClone(seedHistory)).map(normalizeHistory);
  state.assets = (local?.assets || structuredClone(seedAssets)).map(normalizeAsset);
  state.statusEvents = (local?.statusEvents || []).map(normalizeStatusEvent);
  state.storageMode = 'local';
  applyBusinessDefaults();
}

function hydrateDemoState() {
  state.stages = structuredClone(demoData.stages).map(normalizeStage).sort((a, b) => a.position - b.position);
  state.history = structuredClone(demoData.history).map(normalizeHistory);
  state.assets = structuredClone(demoData.assets).map(normalizeAsset);
  state.statusEvents = structuredClone(demoData.statusEvents).map(normalizeStatusEvent);
  state.storageMode = 'local';
}

async function seedSupabase() {
  await supabase.from('pipeline_stages').insert(STAGE_META.map(toDbStage));
  await supabase.from('pipeline_history').insert(seedHistory.map(toDbHistory));
  await supabase.from('pipeline_assets').insert(seedAssets.map(toDbAsset));
}

function render() {
  renderStages();
  renderHistory();
  renderAssets();
}

function renderStages() {
  els.stageBand.innerHTML = state.stages.map((stage) => `
    <div class="col" data-stage="${stage.slug}" data-status="${stage.isActive ? 'operacional' : 'interrompido'}">
      <div class="col-top">
        <h2>${escapeHtml(stage.name)}</h2>
        <label class="toggle">
          <input type="checkbox" ${stage.isActive ? 'checked' : ''} data-toggle-stage="${stage.slug}">
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="col-meta">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700">Responsável:</span>
        <input class="owner-input" type="text" value="${escapeAttr(stage.owner || '')}" placeholder="Fabio Ribeiro" data-owner-stage="${stage.slug}">
      </div>
    </div>
  `).join('');

  els.blockerBand.innerHTML = state.stages.map((stage) => `
    <div class="col">
      <div class="row-label">O que bloqueia se cair</div>
      <p class="block-text">${escapeHtml(stage.blockerText || '')}</p>
    </div>
  `).join('');

  els.stageBand.querySelectorAll('[data-toggle-stage]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const stageSlug = event.currentTarget.dataset.toggleStage;
      await toggleStage(stageSlug, event.currentTarget.checked);
    });
  });

  els.stageBand.querySelectorAll('[data-owner-stage]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const stageSlug = event.currentTarget.dataset.ownerStage;
      await updateOwner(stageSlug, event.currentTarget.value.trim());
    });
  });

  syncOffColumns();
}

function renderHistory() {
  const days = getHistoryDays(HISTORY_DAYS);
  const historyIndex = new Map(state.history.map((entry) => [`${entry.stage_slug}:${entry.entry_date}`, entry]));
  const statusIndex = new Map();

  state.statusEvents.forEach((event) => {
    const key = `${event.stage_slug}:${event.changed_at.slice(0, 10)}`;
    if (!statusIndex.has(key)) statusIndex.set(key, []);
    statusIndex.get(key).push(event);
  });

  els.historyScroll.innerHTML = days.map((dateKey) => `
    <div class="band band-history" data-ts="${dateKey}">
      ${state.stages.map((stage) => {
        const entry = historyIndex.get(`${stage.slug}:${dateKey}`);
        const fallback = buildFallbackEntry(stage.slug, dateKey);
        const current = entry || fallback;
        const editable = isHistoryEditable(stage.slug, dateKey);
        const events = statusIndex.get(`${stage.slug}:${dateKey}`) || [];
        return `
          <div class="col">
            <div class="history-cell ${editable ? 'is-editable' : 'is-locked'}" data-history-stage="${stage.slug}" data-history-date="${dateKey}" data-history-editable="${editable ? 'true' : 'false'}">
              <div class="history-meta-row">
                <div class="log-time">${formatHistoryTime(current)}</div>
                ${editable ? `<button class="history-edit-btn" type="button" aria-label="Editar histórico">${editIcon()}</button>` : ''}
              </div>
              <p class="log-text ${current.isPlaceholder ? 'placeholder' : ''}">${renderHistoryText(current)}</p>
              ${events.length ? `<span class="status-event">${events[0].is_active ? 'Status voltou para operacional.' : 'Status marcado como interrompido.'}</span>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');

  els.historyScroll.querySelectorAll('[data-history-stage]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.historyEditable !== 'true') return;
      openUpdateModal(button.dataset.historyStage, button.dataset.historyDate);
    });
  });

  els.historyScroll.querySelectorAll('.history-cell a').forEach((link) => {
    link.addEventListener('click', (event) => event.stopPropagation());
  });

  els.historyScroll.querySelectorAll('.history-edit-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const cell = event.currentTarget.closest('[data-history-stage]');
      if (!cell || cell.dataset.historyEditable !== 'true') return;
      openUpdateModal(cell.dataset.historyStage, cell.dataset.historyDate);
    });
  });

  syncOffColumns();
}

function renderAssets() {
  sortAssets();
  if (!state.assets.length) {
    els.assetActionBar.classList.add('is-hidden');
    els.assetBody.innerHTML = `
      <div class="asset-empty-state">
        <div class="asset-empty-label">Criativos</div>
        <h3>Nenhum criativo incluído ainda.</h3>
        <p>Inclua o primeiro criativo para começar a acompanhar os números por etapa.</p>
        <button class="asset-empty-action" type="button" id="emptyAssetAction">Incluir criativo</button>
      </div>
    `;
    document.getElementById('emptyAssetAction')?.addEventListener('click', () => openAssetModal());
    return;
  }

  els.assetActionBar.classList.remove('is-hidden');
  els.assetBody.innerHTML = state.assets.map((asset) => renderAsset(asset)).join('');
  els.assetBody.querySelectorAll('[data-asset-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const asset = state.assets.find((item) => item.id === button.dataset.assetEdit);
      openAssetModal(asset);
    });
  });

  els.assetBody.querySelectorAll('.asset-link').forEach((link) => {
    link.addEventListener('click', (event) => event.stopPropagation());
  });

  els.assetBody.querySelectorAll('.metric-input').forEach((input) => {
    if (input.hasAttribute('readonly')) return;
    input.addEventListener('input', (event) => {
      handleMetricInput(event.currentTarget);
    });

    input.addEventListener('blur', async (event) => {
      await flushMetricInput(event.currentTarget, true);
    });

    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      }
    });
  });

  state.assets.forEach((asset) => calcConversions(asset.id));
}

async function toggleStage(stageSlug, isActive) {
  const stage = state.stages.find((item) => item.slug === stageSlug);
  if (!stage) return;
  stage.isActive = isActive;
  const event = {
    id: crypto.randomUUID(),
    stage_slug: stageSlug,
    is_active: isActive,
    changed_at: new Date().toISOString()
  };
  state.statusEvents.unshift(event);
  syncOffColumns();
  renderHistory();
  await persistStage(stage);
  await persistStatusEvent(event);
}

async function updateOwner(stageSlug, owner) {
  const stage = state.stages.find((item) => item.slug === stageSlug);
  if (!stage) return;
  stage.owner = owner;
  await persistStage(stage);
}

function syncOffColumns() {
  state.stages.forEach((stage, index) => {
    document.querySelectorAll('.band').forEach((band) => {
      const col = band.querySelectorAll(':scope > .col')[index];
      if (col) col.classList.toggle('col-off', !stage.isActive);
    });
  });
}

function openUpdateModal(stageSlug, dateKey) {
  if (dateKey > todayKey) return;
  if (!isHistoryEditable(stageSlug, dateKey)) return;
  const stage = state.stages.find((item) => item.slug === stageSlug);
  const entry = state.history.find((item) => item.stage_slug === stageSlug && item.entry_date === dateKey);
  state.updateDraft = { stageSlug, date: dateKey, originalDate: dateKey };
  els.updateModalMode.textContent = entry ? 'Editar atualização' : 'Nova atualização';
  els.updateModalTitle.textContent = stage?.name || '';
  els.updateDate.value = dateKey;
  els.updateDate.readOnly = true;
  els.skipCheck.checked = Boolean(entry?.is_skipped);
  els.updateText.value = entry?.description || '';
  els.updateLink.value = entry?.evidence_url || '';
  syncUpdateSkipUi();
  els.updateBackdrop.classList.add('open');
  (entry?.is_skipped ? els.updateDate : els.updateText).focus();
}

function closeUpdateModal() {
  els.updateBackdrop.classList.remove('open');
}

function syncUpdateSkipUi() {
  const locked = els.skipCheck.checked;
  els.updateFields.style.opacity = locked ? '.35' : '1';
  els.updateFields.style.pointerEvents = locked ? 'none' : 'auto';
}

async function saveHistoryFromModal() {
  const stageSlug = state.updateDraft.stageSlug;
  const originalDate = state.updateDraft.originalDate;
  const entryDate = originalDate;

  if (entryDate > todayKey) {
    closeUpdateModal();
    return;
  }

  if (!isHistoryEditable(stageSlug, entryDate)) {
    closeUpdateModal();
    return;
  }

  const skip = els.skipCheck.checked;
  const description = skip ? 'Sem atualização hoje.' : els.updateText.value.trim();
  const evidenceUrl = skip ? '' : els.updateLink.value.trim();

  if (!skip && !description) {
    els.updateText.focus();
    return;
  }

  const existingIndex = state.history.findIndex((item) => item.stage_slug === stageSlug && item.entry_date === originalDate);
  const base = {
    id: existingIndex >= 0 ? state.history[existingIndex].id : crypto.randomUUID(),
    stage_slug: stageSlug,
    entry_date: entryDate,
    description,
    evidence_url: evidenceUrl,
    is_skipped: skip,
    created_at: existingIndex >= 0 ? state.history[existingIndex].created_at : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    state.history[existingIndex] = base;
  } else {
    state.history.unshift(base);
  }

  renderHistory();
  closeUpdateModal();
  await persistHistory(base, originalDate);
}

function openAssetModal(asset = null) {
  state.assetDraft = { id: asset?.id || null };
  els.assetModalMode.textContent = 'Ativos em circulação';
  els.assetModalTitle.textContent = asset ? 'Editar criativo' : 'Incluir criativo';
  els.assetTitle.value = asset?.title || '';
  els.assetLink.value = asset?.external_url || '';
  els.assetNote.value = asset?.published_on || '';
  els.assetBackdrop.classList.add('open');
  els.assetTitle.focus();
}

function closeAssetModal() {
  els.assetBackdrop.classList.remove('open');
}

async function saveAssetFromModal() {
  const title = els.assetTitle.value.trim();
  if (!title) {
    els.assetTitle.focus();
    return;
  }

  const link = els.assetLink.value.trim();
  if (!link) {
    els.assetLink.focus();
    return;
  }

  const publishedOn = els.assetNote.value;
  if (!publishedOn) {
    els.assetNote.focus();
    return;
  }

  const existing = state.assets.find((asset) => asset.id === state.assetDraft.id);
  const asset = {
    id: existing?.id || crypto.randomUUID(),
    title,
    external_url: link,
    published_on: publishedOn,
    views: existing?.views ?? null,
    visits: existing?.visits ?? null,
    joins: existing?.joins ?? null,
    plugin_accesses: existing?.plugin_accesses ?? null,
    creators: existing?.creators ?? null,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (existing) {
    Object.assign(existing, asset);
  } else {
    state.assets.unshift(asset);
  }

  renderAssets();
  closeAssetModal();
  await persistAsset(asset);
}

function renderAsset(asset) {
  return `
    <div class="a-entry">
      <div class="a-name">
        <div class="asset-header-btn" data-asset-edit="${asset.id}">
          <span class="asset-note">${escapeHtml(formatDateLabel(asset.published_on))}</span>
          ${asset.external_url ? `<a class="asset-link" href="${escapeAttr(asset.external_url)}" target="_blank" rel="noreferrer">${externalIcon()}</a>` : '<span></span>'}
          <span class="asset-title">${escapeHtml(asset.title)}</span>
        </div>
      </div>
      <div class="a-metrics" data-asset-metrics="${asset.id}">
        ${metricCell(asset.id, 'views', asset.views, 'views')}
        ${metricCell(asset.id, 'visits', asset.visits, 'visitas')}
        ${metricCell(asset.id, 'joins', asset.joins, 'entradas')}
        ${metricCell(asset.id, 'plugin_accesses', asset.plugin_accesses, 'plugin')}
        ${metricCell(asset.id, 'creators', asset.creators, 'creators')}
      </div>
    </div>
  `;
}

function metricCell(assetId, field, value, label, options = {}) {
  const readonly = options.readonly ? 'readonly' : '';
  const classes = ['a-cell'];
  if (options.untracked) classes.push('a-cell-untracked');
  return `
    <div class="${classes.join(' ')}">
      <div class="a-cell-left">
        <input class="metric-input" type="text" inputmode="numeric" value="${formatMetric(value)}" data-asset-id="${assetId}" data-asset-field="${field}" ${readonly}>
        <div class="metric-info">
          <span class="metric-label">${label}</span>
          ${options.untracked ? '' : field !== 'views' ? '<span class="metric-pct">—</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function calcConversions(assetId) {
  const wrapper = document.querySelector(`[data-asset-metrics="${assetId}"]`);
  if (!wrapper) return;
  const inputs = wrapper.querySelectorAll('.metric-input');
  const pcts = wrapper.querySelectorAll('.metric-pct');
  pcts.forEach((pct, index) => {
    const prev = parseMetric(inputs[index].value);
    const curr = parseMetric(inputs[index + 1].value);
    pct.textContent = prev && curr !== null ? `${((curr / prev) * 100).toFixed(1)}%` : '—';
  });
}

function handleMetricInput(input) {
  const assetId = input.dataset.assetId;
  const field = input.dataset.assetField;
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;

  input.value = String(input.value).replace(/[^\d]/g, '');
  asset[field] = parseMetric(input.value);
  asset.updated_at = new Date().toISOString();
  calcConversions(assetId);
  queueMetricPersist(asset, input);
}

function queueMetricPersist(asset, input) {
  const timerKey = `${asset.id}:${input.dataset.assetField}`;
  clearTimeout(assetMetricSaveTimers.get(timerKey));
  updateSyncBadge('Salvando estatisticas...', state.storageMode === 'supabase' ? 'online' : 'local');
  assetMetricSaveTimers.set(timerKey, setTimeout(async () => {
    assetMetricSaveTimers.delete(timerKey);
    await persistAsset(asset);
    updateSyncBadge(state.storageMode === 'supabase' ? 'Supabase conectado' : 'Modo local', state.storageMode === 'supabase' ? 'online' : 'local');
  }, 450));
}

async function flushMetricInput(input, shouldFormat = false) {
  const assetId = input.dataset.assetId;
  const field = input.dataset.assetField;
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;

  const timerKey = `${asset.id}:${field}`;
  clearTimeout(assetMetricSaveTimers.get(timerKey));
  assetMetricSaveTimers.delete(timerKey);
  asset[field] = parseMetric(input.value);
  asset.updated_at = new Date().toISOString();
  if (shouldFormat) input.value = formatMetric(asset[field]);
  calcConversions(assetId);
  await persistAsset(asset);
  updateSyncBadge(state.storageMode === 'supabase' ? 'Supabase conectado' : 'Modo local', state.storageMode === 'supabase' ? 'online' : 'local');
}

async function persistStage(stage) {
  if (state.storageMode === 'supabase') {
    const { error } = await supabase.from('pipeline_stages').upsert([toDbStage(stage)], { onConflict: 'slug' });
    if (error) {
      console.error(error);
      updateSyncBadge('Erro ao salvar etapa', 'error');
    }
  }
  saveLocalSnapshot();
}

async function persistHistory(entry, originalDate = entry.entry_date) {
  if (state.storageMode === 'supabase') {
    if (originalDate !== entry.entry_date) {
      const { error: deleteError } = await supabase
        .from('pipeline_history')
        .delete()
        .eq('stage_slug', entry.stage_slug)
        .eq('entry_date', originalDate);
      if (deleteError) {
        console.error(deleteError);
        updateSyncBadge('Erro ao mover histórico', 'error');
      }
    }

    const { error } = await supabase.from('pipeline_history').upsert([toDbHistory(entry)], { onConflict: 'stage_slug,entry_date' });
    if (error) {
      console.error(error);
      updateSyncBadge('Erro ao salvar histórico', 'error');
    }
  }
  saveLocalSnapshot();
}

async function persistAsset(asset) {
  if (state.storageMode === 'supabase') {
    const { error } = await supabase.from('pipeline_assets').upsert([toDbAsset(asset)], { onConflict: 'id' });
    if (error) {
      console.error(error);
      updateSyncBadge('Erro ao salvar ativo', 'error');
    }
  }
  saveLocalSnapshot();
}

async function persistStatusEvent(event) {
  if (state.storageMode === 'supabase') {
    const { error } = await supabase.from('pipeline_stage_status_events').insert([event]);
    if (error) {
      console.error(error);
      updateSyncBadge('Erro ao salvar status', 'error');
    }
  }
  saveLocalSnapshot();
}

function saveLocalSnapshot() {
  saveLocalState({
    stages: state.stages,
    history: state.history,
    assets: state.assets,
    statusEvents: state.statusEvents
  });
}

function applyBusinessDefaults() {
  const ownerMap = {
    'tiktok-ads': 'Nicolas',
    landing: 'Jeff',
    discord: 'Nicolas / Murilo',
    plugin: 'Jeff',
    programacao: 'Nicolas'
  };

  const stageMap = new Map(state.stages.map((stage) => [stage.slug, stage]));
  state.stages = STAGE_META.map((baseStage) => {
    const current = stageMap.get(baseStage.slug) || {};
    return normalizeStage({
      ...baseStage,
      ...current,
      owner: ownerMap[baseStage.slug] ?? current.owner ?? baseStage.owner ?? '',
      position: baseStage.position
    });
  }).sort((a, b) => a.position - b.position);

  state.history = state.history.filter((entry) => entry.entry_date !== todayKey);
  state.assets = state.assets.filter((asset) => asset.published_on !== todayKey);
  state.statusEvents = state.statusEvents.filter((event) => !event.changed_at.startsWith(todayKey));
  state.assets = state.assets.map((asset) => ({
    ...asset,
    views: asset.views ?? null,
    visits: asset.visits ?? null,
    joins: asset.joins ?? null,
    plugin_accesses: asset.plugin_accesses ?? null,
    creators: asset.creators ?? asset.participants ?? null
  }));
}

function buildFallbackEntry(stageSlug, dateKey) {
  if (dateKey < todayKey) {
    return {
      stage_slug: stageSlug,
      entry_date: dateKey,
      description: 'Não preenchido.',
      evidence_url: '',
      is_skipped: false,
      isPlaceholder: true
    };
  }

  return {
    stage_slug: stageSlug,
    entry_date: dateKey,
    description: '',
    evidence_url: '',
    is_skipped: false,
    isPlaceholder: true
  };
}

function isHistoryEditable(stageSlug, dateKey) {
  const entry = state.history.find((item) => item.stage_slug === stageSlug && item.entry_date === dateKey);
  if (entry) return true;
  return dateKey === todayKey;
}

function renderHistoryText(entry) {
  const text = escapeHtml(entry.description || '');
  if (!text && entry.isPlaceholder) return '—';
  if (!entry.evidence_url) return text;
  return `${text} <a href="${escapeAttr(entry.evidence_url)}" target="_blank" rel="noreferrer">evidência</a>`;
}

function formatHistoryTime(entry) {
  if (entry.isPlaceholder) {
    return `${formatDateLabel(entry.entry_date)} · ${entry.entry_date < todayKey ? 'não preenchido' : 'hoje'}`;
  }

  const source = entry.updated_at || entry.created_at || `${entry.entry_date}T12:00:00`;
  return `${formatDateLabel(entry.entry_date)} · ${fmtTime.format(new Date(source))}`;
}

function updateStickyOffsets() {
  const titlesH = document.querySelector('.band-titles').offsetHeight;
  document.getElementById('history-label-band').style.top = `${titlesH}px`;
}

function updateSyncBadge(label, mode) {
  els.syncBadge.textContent = label;
  els.syncBadge.className = `sync-badge ${mode}`;
}

function loadLocalState() {
  if (DEMO_MODE) return null;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return migrateLocalState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveLocalState(payload) {
  if (DEMO_MODE) return;
  localStorage.setItem(storageKey, JSON.stringify({
    ...payload,
    version: LOCAL_STATE_VERSION
  }));
}

function migrateLocalState(payload) {
  if (!payload) return null;
  const version = Number(payload.version || 0);

  if (version >= LOCAL_STATE_VERSION) return payload;

  return {
    ...payload,
    version: LOCAL_STATE_VERSION,
    history: [],
    assets: []
  };
}

function getHistoryDays(total) {
  const limit = DEMO_MODE ? 6 : total;
  const days = [todayKey];
  const extraDays = state.history
    .map((entry) => entry.entry_date)
    .filter((dateKey, index, arr) => arr.indexOf(dateKey) === index)
    .filter((dateKey) => DEMO_MODE || dateKey >= todayKey)
    .sort((a, b) => b.localeCompare(a));

  extraDays.forEach((dateKey) => {
    if (!days.includes(dateKey) && days.length < limit) days.push(dateKey);
  });

  return days;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value) {
  if (!value) return '';
  return fmtDay.format(new Date(`${value}T12:00:00`));
}

function parseMetric(value) {
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}

function formatMetric(value) {
  if (value === null || value === undefined || value === '') return '';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

function sortAssets() {
  state.assets.sort((a, b) => (b.published_on || '').localeCompare(a.published_on || ''));
}

function historyEntry(stageSlug, entryDate, description, evidenceUrl, isSkipped, createdAt) {
  return {
    id: crypto.randomUUID(),
    stage_slug: stageSlug,
    entry_date: entryDate,
    description,
    evidence_url: evidenceUrl,
    is_skipped: isSkipped,
    created_at: createdAt,
    updated_at: createdAt
  };
}

function assetEntry(title, externalUrl, publishedOn, views, visits, joins, pluginAccesses, creators) {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    external_url: externalUrl,
    published_on: publishedOn,
    views,
    visits,
    joins,
    plugin_accesses: pluginAccesses,
    creators,
    created_at: timestamp,
    updated_at: timestamp
  };
}

function normalizeStage(stage) {
  return {
    slug: stage.slug,
    name: stage.name,
    owner: stage.owner || '',
    blockerText: stage.blocker_text || stage.blockerText || '',
    isActive: stage.is_active ?? stage.isActive ?? true,
    position: Number(stage.position ?? 0)
  };
}

function normalizeHistory(entry) {
  return {
    id: entry.id,
    stage_slug: entry.stage_slug,
    entry_date: entry.entry_date,
    description: entry.description || '',
    evidence_url: entry.evidence_url || '',
    is_skipped: Boolean(entry.is_skipped),
    created_at: entry.created_at || null,
    updated_at: entry.updated_at || null
  };
}

function normalizeAsset(asset) {
  return {
    id: asset.id,
    title: asset.title,
    external_url: asset.external_url || '',
    published_on: asset.published_on || '',
    views: asset.views ?? null,
    visits: asset.visits ?? null,
    joins: asset.joins ?? null,
    plugin_accesses: asset.plugin_accesses ?? null,
    creators: asset.creators ?? asset.participants ?? null,
    created_at: asset.created_at || null,
    updated_at: asset.updated_at || null
  };
}

function normalizeStatusEvent(event) {
  return {
    id: event.id,
    stage_slug: event.stage_slug,
    is_active: Boolean(event.is_active),
    changed_at: event.changed_at
  };
}

function toDbStage(stage) {
  return {
    slug: stage.slug,
    name: stage.name,
    owner: stage.owner || '',
    blocker_text: stage.blockerText || stage.blocker_text || '',
    is_active: stage.isActive ?? stage.is_active ?? true,
    position: Number(stage.position ?? 0)
  };
}

function toDbHistory(entry) {
  return {
    id: entry.id,
    stage_slug: entry.stage_slug,
    entry_date: entry.entry_date,
    description: entry.description || '',
    evidence_url: entry.evidence_url || '',
    is_skipped: Boolean(entry.is_skipped),
    created_at: entry.created_at,
    updated_at: entry.updated_at
  };
}

function toDbAsset(asset) {
  return {
    id: asset.id,
    title: asset.title,
    external_url: asset.external_url || '',
    published_on: asset.published_on || null,
    views: asset.views ?? null,
    visits: asset.visits ?? null,
    joins: asset.joins ?? null,
    plugin_accesses: asset.plugin_accesses ?? null,
    creators: asset.creators ?? null,
    participants: null,
    created_at: asset.created_at,
    updated_at: asset.updated_at
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function externalIcon() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
}

function editIcon() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
}

function createDemoData(dateKey) {
  const dayOffsets = [0, -1, -2, -3, -4, -5];
  const demoDays = dayOffsets.map((offset) => {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + offset);
    return toDateKey(date);
  });

  return {
    stages: STAGE_META.map((stage) => ({ ...stage })),
    history: [
      historyEntry('tiktok-ads', demoDays[0], 'Dois criativos novos publicados e campanha principal mantida ativa.', 'https://example.com/ads', false, `${demoDays[0]}T09:20:00`),
      historyEntry('landing', demoDays[0], 'Headline revisada e CTA de entrada destacado para mobile.', 'https://example.com/landing', false, `${demoDays[0]}T11:10:00`),
      historyEntry('discord', demoDays[0], 'Fluxo de recepcao ajustado com mensagem inicial e canal de boas-vindas.', 'https://example.com/discord', false, `${demoDays[0]}T11:40:00`),
      historyEntry('plugin', demoDays[0], 'Plugin operante e onboarding revisado para aumentar a criacao de creators.', 'https://example.com/plugin', false, `${demoDays[0]}T14:20:00`),
      historyEntry('programacao', demoDays[0], 'Agenda da semana publicada e evento principal confirmado.', '', false, `${demoDays[0]}T17:45:00`),
      historyEntry('tiktok-ads', demoDays[1], 'Teste A/B de criativos pausado e melhor variacao mantida.', 'https://example.com/ads-2', false, `${demoDays[1]}T10:05:00`),
      historyEntry('landing', demoDays[1], 'Bloco social proof atualizado com prints da comunidade.', '', false, `${demoDays[1]}T14:20:00`),
      historyEntry('discord', demoDays[1], 'Canais de entrada reorganizados para reduzir ruido inicial.', '', false, `${demoDays[1]}T16:10:00`),
      historyEntry('plugin', demoDays[1], 'Acesso ao plugin estabilizado e evento de instalacao guiada realizado.', '', false, `${demoDays[1]}T17:00:00`),
      historyEntry('programacao', demoDays[1], 'Calendario semanal revisado com foco em evento de sabado.', '', false, `${demoDays[1]}T18:00:00`),
      historyEntry('tiktok-ads', demoDays[2], 'Nova copy de anuncio publicada com foco em aula gratuita.', '', false, `${demoDays[2]}T09:15:00`),
      historyEntry('landing', demoDays[2], 'Ajuste fino no CTA principal para entrada no Discord.', '', false, `${demoDays[2]}T12:30:00`),
      historyEntry('discord', demoDays[2], 'Mensagem automatica de boas-vindas revisada.', '', false, `${demoDays[2]}T13:00:00`),
      historyEntry('plugin', demoDays[2], 'Tutorial de instalacao encurtado para reduzir abandono.', '', false, `${demoDays[2]}T15:00:00`),
      historyEntry('programacao', demoDays[2], 'Tema da semana definido com apoio dos moderadores.', '', false, `${demoDays[2]}T17:20:00`),
      historyEntry('tiktok-ads', demoDays[3], 'Campanha de retargeting ativada para visitantes recentes.', '', false, `${demoDays[3]}T08:55:00`),
      historyEntry('landing', demoDays[3], 'Seção de prova social expandida com novos depoimentos.', '', false, `${demoDays[3]}T10:40:00`),
      historyEntry('discord', demoDays[3], 'Canal de regras simplificado para leitura rapida.', '', false, `${demoDays[3]}T15:10:00`),
      historyEntry('plugin', demoDays[3], 'Falha pontual no plugin corrigida apos validacao do time.', '', false, `${demoDays[3]}T16:30:00`),
      historyEntry('programacao', demoDays[3], 'Atividade principal da sexta foi confirmada.', '', false, `${demoDays[3]}T19:00:00`),
      historyEntry('tiktok-ads', demoDays[4], 'Criativo de topo retomado apos queda de desempenho dos testes.', '', false, `${demoDays[4]}T11:25:00`),
      historyEntry('landing', demoDays[4], 'Formulario de entrada encurtado para reduzir atrito.', '', false, `${demoDays[4]}T12:50:00`),
      historyEntry('discord', demoDays[4], 'Mensagem fixada com primeiros passos foi atualizada.', '', false, `${demoDays[4]}T14:45:00`),
      historyEntry('plugin', demoDays[4], 'Checklist de instalacao publicado para novos membros.', '', false, `${demoDays[4]}T16:00:00`),
      historyEntry('programacao', demoDays[4], 'Checklist de moderacao alinhado para a semana.', '', false, `${demoDays[4]}T18:30:00`),
      historyEntry('tiktok-ads', demoDays[5], 'Primeira leva de criativos da semana entrou em circulacao.', '', false, `${demoDays[5]}T09:00:00`),
      historyEntry('landing', demoDays[5], 'Hero principal revisado com promessa mais clara.', '', false, `${demoDays[5]}T10:30:00`),
      historyEntry('discord', demoDays[5], 'Boas-vindas segmentadas por perfil foram testadas.', '', false, `${demoDays[5]}T13:20:00`),
      historyEntry('plugin', demoDays[5], 'Primeira medicao de creators ativados via plugin foi consolidada.', '', false, `${demoDays[5]}T15:40:00`),
      historyEntry('programacao', demoDays[5], 'Planejamento-base da semana foi publicado.', '', false, `${demoDays[5]}T17:10:00`)
    ],
    assets: [
      assetEntry('Aula aberta', 'https://example.com/video-demo-1', dateKey, 18400, 562, 74, 41, 29),
      assetEntry('Desafio da semana', 'https://example.com/video-demo-2', dateKey, 12600, 391, 48, 24, 16),
      assetEntry('Mapa da semana', 'https://example.com/video-demo-3', demoDays[1], 9800, 284, 39, 21, 14),
      assetEntry('Primeiros passos', 'https://example.com/video-demo-4', demoDays[2], 15400, 471, 61, 33, 25),
      assetEntry('Evento ao vivo', 'https://example.com/video-demo-5', demoDays[4], 11200, 336, 44, 27, 18)
    ],
    statusEvents: []
  };
}
