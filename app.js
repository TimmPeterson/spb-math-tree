'use strict';

(() => {
  const { people, links } = window.LINEAGE_DATA;
  const fields = [
    { id: 'algebra', name: 'Algebra', color: '#9678bf' },
    { id: 'analysis', name: 'Analysis', color: '#5284be' },
    { id: 'geometry', name: 'Geometry', color: '#459983' },
    { id: 'discrete', name: 'Discrete mathematics', color: '#d09846' },
    { id: 'physics', name: 'Mathematical physics', color: '#c27783' },
    { id: 'probability', name: 'Probability theory', color: '#779b55' },
  ];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const byId = new Map(people.map(p => [p.id, p]));
  const fieldById = new Map(fields.map(f => [f.id, f]));
  const fieldOf = p => fieldById.get(p.field);
  const initials = p => p.name.split(/\s+/).filter(w => !/^[A-Z]\.$/.test(w)).map(w => w[0]).filter(Boolean).filter((_, i, a) => i === 0 || i === a.length - 1).join('');
  const shortInstitution = p => p.affiliationShort || (p.institutions.includes('mcs') ? 'SPbSU · MCS' : p.institutions.includes('pdmi') ? 'PDMI' : p.institutions.includes('spbu') ? 'SPbSU' : 'Academic lineage');
  const isEntrant = p => p.stage === 'student' && /entrant/i.test(p.degree);
  const studentTitle = p => isEntrant(p) ? 'Doctoral entrant' : 'PhD student';
  const stageLabel = p => p.stage === 'student' ? `${studentTitle(p)}${p.statusAsOf ? ' · ' + p.statusAsOf : ' · dated record'}` : p.stage === 'historical' ? 'Historical figure' : p.stage === 'researcher' ? 'Researcher' : p.degree;
  const isContext = p => p.contextOnly || p.stage === 'historical';
  const safeUrl = s => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) ? esc(u.href) : '#'; } catch { return '#'; } };
  const sourcesHTML = sources => (sources || []).map(s => `<a class="source-link" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}<span>${esc(s.label || new URL(s.url).hostname)}</span></a>`).join('');
  const state = { field: 'all', institutions: new Set(), stages: new Set(), showHistory: false, query: '', view: 'tree', selected: null, focus: null, scale: 1, x: 0, y: 0, visible: [], positions: new Map(), width: 0, height: 0 };
  const canvas = $('#canvas');
  const world = $('#graph-world');
  let previousProfileFocus = null;

  $('#stat-people').textContent = people.length;
  $('#stat-links').textContent = links.length;
  $('#stat-students').textContent = people.filter(p => p.stage === 'student' && !isEntrant(p)).length;
  $('#student-count').textContent = people.filter(p => p.stage === 'student').length;

  function renderFields() {
    const roster = people.filter(p => state.showHistory || !isContext(p));
    $('#field-filters').innerHTML = [{ id: 'all', name: 'All fields' }, ...fields].map(f => `<button class="field-button ${state.field === f.id ? 'active' : ''}" data-field="${f.id}" aria-pressed="${state.field === f.id}"><span class="field-dot ${f.id === 'all' ? 'all' : ''}" style="--field:${f.color || ''}"></span><span>${f.name}</span><span class="field-count">${f.id === 'all' ? roster.length : roster.filter(p => p.field === f.id).length}</span></button>`).join('');
  }

  function visiblePeople() {
    const query = state.query.toLocaleLowerCase().trim().normalize('NFKD');
    return people.filter(p => {
      const haystack = [p.name, p.nativeName, ...(p.aliases || []), p.interests, p.degree, p.affiliation, fieldOf(p).name].join(' ').toLocaleLowerCase().normalize('NFKD');
      return (state.field === 'all' || state.field === p.field)
        && (!state.institutions.size || [...state.institutions].some(i => p.institutions.includes(i) || (i === 'spbu' && p.institutions.includes('mcs'))))
        && (!state.stages.size || state.stages.has(p.stage === 'student' ? 'student' : 'established'))
        && (state.showHistory || !isContext(p) || !!query || (state.focus && state.focus.has(p.id)))
        && (!query || query.split(/\s+/).every(term => haystack.includes(term)))
        && (!state.focus || state.focus.has(p.id));
    }).sort((a, b) => Number(isContext(a)) - Number(isContext(b)) || Number(b.stage === 'student') - Number(a.stage === 'student') || a.name.localeCompare(b.name));
  }

  function withSupervisors(visible) {
    // A field or career filter should not turn documented students into islands.
    // Keep their actual advisors as compact context; search remains an exact filter.
    if (state.query.trim()) return visible;
    const ids = new Set(visible.map(p => p.id));
    const queue = [...ids];
    for (let i = 0; i < queue.length; i++) {
      for (const link of links) {
        if (link.target === queue[i] && !ids.has(link.source)) {
          ids.add(link.source); queue.push(link.source);
        }
      }
    }
    return [...visible, ...people.filter(p => ids.has(p.id) && !visible.some(v => v.id === p.id))];
  }

  function layoutGraph(visible, compactIds) {
    const ids = new Set(visible.map(p => p.id));
    const activeLinks = links.filter(l => ids.has(l.source) && ids.has(l.target));
    const neighbors = new Map(visible.map(p => [p.id, []]));
    activeLinks.forEach(l => { neighbors.get(l.source).push(l.target); neighbors.get(l.target).push(l.source); });
    const seen = new Set(), components = [];
    for (const p of visible) {
      if (seen.has(p.id)) continue;
      const component = [], queue = [p.id]; seen.add(p.id);
      while (queue.length) {
        const id = queue.shift(); component.push(id);
        for (const other of neighbors.get(id)) if (!seen.has(other)) { seen.add(other); queue.push(other); }
      }
      components.push(component);
    }
    // Rank the connected components in this filtered view, largest first.
    // Equal-size families favor current researchers and doctoral students.
    components.sort((a, b) => {
      const currentCount = c => c.filter(id => !isContext(byId.get(id))).length;
      const studentCount = c => c.filter(id => byId.get(id).stage === 'student').length;
      return b.length - a.length || currentCount(b) - currentCount(a)
        || studentCount(b) - studentCount(a)
        || [...a].sort()[0].localeCompare([...b].sort()[0]);
    });
    const result = new Map();
    const slot = 224, cardW = 200;
    const cardHeight = id => compactIds.has(id) ? 48 : 94;
    const desiredWidth = Math.max(870, Math.min(1330, canvas.clientWidth / .83));
    let shelfX = 0, shelfY = 0, shelfH = 0, totalW = 0;
    const labels = [];
    for (const component of components) {
      // Preserve reading order when wrapping: a smaller family must not jump
      // ahead of a larger one just because it fits the rest of the shelf.
      const set = new Set(component);
      const componentLinks = activeLinks.filter(l => set.has(l.source) && set.has(l.target));
      const parents = new Map(component.map(id => [id, []]));
      componentLinks.forEach(l => { if (!parents.get(l.target).includes(l.source)) parents.get(l.target).push(l.source); });
      const primaryChildren = new Map(component.map(id => [id, []]));
      for (const id of component) if (parents.get(id).length) primaryChildren.get(parents.get(id)[0]).push(id);
      let roots = component.filter(id => parents.get(id).length === 0);
      if (!roots.length) roots = [component[0]];
      const depthMemo = new Map();
      function depth(id, path = new Set()) {
        if (depthMemo.has(id)) return depthMemo.get(id);
        if (path.has(id)) return 0;
        path.add(id);
        const d = parents.get(id).length ? 1 + Math.max(...parents.get(id).map(p => depth(p, new Set(path)))) : 0;
        depthMemo.set(id, d); return d;
      }
      component.forEach(id => depth(id));
      let leaf = 0;
      const localX = new Map();
      function place(id, path = new Set()) {
        if (localX.has(id)) return localX.get(id);
        if (path.has(id)) return leaf++ * slot;
        path.add(id);
        const children = primaryChildren.get(id).filter(c => !path.has(c));
        const childXs = children.map(c => place(c, new Set(path)));
        const x = childXs.length ? (childXs[0] + childXs[childXs.length - 1]) / 2 : leaf++ * slot;
        localX.set(id, x); return x;
      }
      roots.forEach(r => place(r));
      component.forEach(id => { if (!localX.has(id)) place(id); });
      let width = Math.max(slot, leaf * slot);
      const maxDepth = Math.max(...depthMemo.values());
      const localY = new Map();
      let height = 27;
      for (let d = 0; d <= maxDepth; d++) {
        const level = component.filter(id => depthMemo.get(id) === d);
        level.forEach(id => localY.set(id, height));
        height += Math.max(...level.map(cardHeight)) + 59;
      }
      // Large cohorts wrap into rows so a supervisor and their students remain visible together.
      if (width > slot * 4) {
        let rowY = 27;
        width = slot * 4;
        for (let d = 0; d <= maxDepth; d++) {
          const level = component.filter(id => depthMemo.get(id) === d).sort((a, b) => localX.get(a) - localX.get(b));
          const count = Math.min(4, level.length);
          const rowStep = Math.max(...level.map(cardHeight)) + 22;
          level.forEach((id, i) => {
            localX.set(id, (i % 4) * slot + (i < 4 ? (4 - count) * slot / 2 : 0));
            localY.set(id, rowY + Math.floor(i / 4) * rowStep);
          });
          rowY += Math.max(1, Math.ceil(level.length / 4)) * rowStep + 37;
        }
        height = rowY;
      }
      if (shelfX && shelfX + width > desiredWidth) { shelfX = 0; shelfY += shelfH + 57; shelfH = 0; }
      for (const id of component) result.set(id, { x: shelfX + localX.get(id), y: shelfY + localY.get(id), w: cardW, h: cardHeight(id), family: component[0] });
      if (component.length > 1) labels.push({ x: shelfX, y: shelfY, text: byId.get(roots[0]).name, count: component.length });
      totalW = Math.max(totalW, shelfX + width);
      shelfX += width + 30; shelfH = Math.max(shelfH, height);
    }
    return { positions: result, width: totalW, height: shelfY + shelfH, activeLinks, labels };
  }

  function edgePath(a, b, positions) {
    const x1 = a.x + a.w / 2, y1 = a.y + a.h;
    const x2 = b.x + b.w / 2, y2 = b.y - 2;
    const midY = (y1 + y2) / 2;
    const family = [...positions.values()].filter(p => p.family === a.family);
    const obstacles = family.filter(p => p !== a && p !== b);
    const intersects = (from, to, p) => Math.min(from.x, to.x) < p.x + p.w + 4
      && Math.max(from.x, to.x) > p.x - 4
      && Math.min(from.y, to.y) < p.y + p.h + 4
      && Math.max(from.y, to.y) > p.y - 4;
    let previous = { x: x1, y: y1 }, blocked = false;
    // The curve is monotone, so these segment bounds also bound the curve.
    for (let i = 1; i <= 40 && !blocked; i++) {
      const t = i / 40, u = 1 - t;
      const point = { x: u * u * u * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x2,
        y: u * u * u * y1 + 3 * u * u * t * midY + 3 * u * t * t * midY + t * t * t * y2 };
      blocked = obstacles.some(p => intersects(previous, point, p)); previous = point;
    }
    if (!blocked) return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;

    // Wrapped cohorts need a clear vertical lane, with horizontal runs in row gaps.
    const sourceRow = family.filter(p => p.y === a.y);
    const laneOffset = (sourceRow.indexOf(a) - (sourceRow.length - 1) / 2) * 2;
    const startY = Math.max(...sourceRow.map(p => p.y + p.h)) + 11 + laneOffset;
    const endY = b.y - 11 + laneOffset;
    const gutters = [...new Set(family.flatMap(p => [p.x - 12 + laneOffset, p.x + p.w + 12 + laneOffset]))]
      .filter(x => !family.some(p => intersects({ x, y: startY }, { x, y: endY }, p)))
      .sort((x, y) => (Math.abs(x - x1) + Math.abs(x - x2)) - (Math.abs(y - x1) + Math.abs(y - x2)));
    const gutter = gutters[0];
    const points = [{ x: x1, y: y1 }, { x: x1, y: startY }, { x: gutter, y: startY },
      { x: gutter, y: endY }, { x: x2, y: endY }, { x: x2, y: y2 }];
    let path = `M${x1},${y1}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], before = points[i - 1], after = points[i + 1];
      const inLength = Math.hypot(p.x - before.x, p.y - before.y);
      const outLength = Math.hypot(after.x - p.x, after.y - p.y);
      if (!inLength || !outLength) { path += ` L${p.x},${p.y}`; continue; }
      const radius = Math.min(6, inLength / 2, outLength / 2);
      path += ` L${p.x + (before.x - p.x) * radius / inLength},${p.y + (before.y - p.y) * radius / inLength}`
        + ` Q${p.x},${p.y} ${p.x + (after.x - p.x) * radius / outLength},${p.y + (after.y - p.y) * radius / outLength}`;
    }
    return path + ` L${x2},${y2}`;
  }

  function renderGraph(resetCamera = true) {
    const graphPeople = withSupervisors(state.visible);
    const matchingIds = new Set(state.visible.map(p => p.id));
    const compactIds = new Set(graphPeople.filter(p => isContext(p) || !matchingIds.has(p.id)).map(p => p.id));
    const layout = layoutGraph(graphPeople, compactIds);
    state.positions = layout.positions; state.width = layout.width; state.height = layout.height;
    $('#empty-state').hidden = state.visible.length > 0;
    $('#nodes').innerHTML = layout.labels.map(l => `<div style="position:absolute;left:${l.x}px;top:${l.y - 2}px;font-size:9px;letter-spacing:1.2px;color:#a0ad95;text-transform:uppercase;white-space:nowrap;pointer-events:none">${esc(l.text)} <span style="opacity:.6;font-size:8px;margin-left:5px">/ ${l.count}</span></div>`).join('') + graphPeople.map(p => {
      const pos = state.positions.get(p.id), f = fieldOf(p);
      const compact = compactIds.has(p.id), supporting = !matchingIds.has(p.id);
      return `<button class="node${compact ? ' context-node' : ''}${p.stage === 'student' && !compact ? ' student-node' : ''}${state.selected === p.id ? ' selected' : ''}" data-person="${esc(p.id)}" data-matching="${!supporting}" style="left:${pos.x}px;top:${pos.y}px;height:${pos.h}px;--field:${f.color}" aria-label="${esc(p.name)}, ${f.name}. ${esc(stageLabel(p))}.${supporting ? ' Supervisor shown for context.' : ''} View research and connections." title="${esc(p.name)} · ${f.name}${supporting ? ' · Supervisor shown for context' : ''}"><span class="node-top"><span class="field-dot"></span><span class="node-name">${esc(p.name)}</span></span><span class="node-meta">${esc(shortInstitution(p))}${compact ? '' : `<span class="node-career${p.stage === 'student' ? ' phd-badge' : ''}">${p.stage === 'student' ? studentTitle(p) + '*' : esc(p.degreeShort || 'Researcher')}</span>`}</span></button>`;
    }).join('');
    $('#edges').innerHTML = `<defs><marker id="arrowhead" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1l4 2-4 2" fill="none" stroke="#9cab91" stroke-width="1"/></marker></defs>` + layout.activeLinks.map(l => {
      const a = state.positions.get(l.source), b = state.positions.get(l.target);
      const d = edgePath(a, b, state.positions);
      return `<path class="edge ${l.type === 'doctoral' ? '' : 'mentorship'}" data-source="${esc(l.source)}" data-target="${esc(l.target)}" d="${d}" marker-end="url(#arrowhead)"><title>${esc(byId.get(l.source).name)} → ${esc(byId.get(l.target).name)}: ${esc(l.label)}</title></path>`;
    }).join('');
    world.style.width = `${state.width}px`; world.style.height = `${state.height}px`;
    if (resetCamera) resetView();
    highlightSelection();
  }

  function renderDirectory() {
    const sorted = [...state.visible].sort((a, b) => Number(isContext(a)) - Number(isContext(b)) || Number(b.stage === 'student') - Number(a.stage === 'student') || a.name.split(' ').at(-1).localeCompare(b.name.split(' ').at(-1)));
    $('#directory-list').innerHTML = sorted.length ? sorted.map(p => `<button class="directory-person" data-person="${esc(p.id)}" style="--field:${fieldOf(p).color}"><span class="directory-identity"><span class="node-initial">${esc(initials(p))}</span><span><strong>${esc(p.name)}</strong><small>${esc(stageLabel(p))}</small></span></span><span><span class="field-pill"><span class="field-dot"></span>${fieldOf(p).name}</span><small>${esc(shortInstitution(p))}</small></span>${icon('arrow')}</button>`).join('') : '<p class="directory-empty">No researchers match these filters. Try a different search or reset the filters.</p>';
  }

  function update(resetCamera = true) {
    state.visible = visiblePeople();
    $('#result-count').textContent = `${state.visible.length} researcher${state.visible.length === 1 ? '' : 's'}`;
    renderFields(); renderGraph(resetCamera); renderDirectory();
  }

  function transform() {
    world.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    $('#zoom-level').textContent = `${Math.round(state.scale * 100)}%`;
    $('#zoom-out').disabled = state.scale <= .04;
    $('#zoom-in').disabled = state.scale >= 1.75;
  }

  function resetView() {
    const width = canvas.clientWidth || 1000;
    state.scale = width < 500 ? .82 : Math.min(1, (width - 60) / Math.min(state.width || 1000, 1200));
    state.scale = Math.max(.5, state.scale);
    state.x = 30;
    if (width < 500 && state.visible.length) {
      const first = [...state.positions.values()].sort((a, b) => a.y - b.y || a.x - b.x)[0];
      if (first) state.x = (width - first.w * state.scale) / 2 - first.x * state.scale;
    }
    state.y = 78; transform();
  }

  function fitView() {
    if (!state.visible.length) return;
    state.scale = Math.min(1.3, (canvas.clientWidth - 65) / state.width, (canvas.clientHeight - 145) / state.height);
    state.scale = Math.max(.04, state.scale);
    state.x = (canvas.clientWidth - state.width * state.scale) / 2;
    state.y = 65 + Math.max(0, (canvas.clientHeight - 145 - state.height * state.scale) / 2);
    transform();
  }

  function zoom(factor, cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2) {
    const scale = Math.max(.04, Math.min(1.75, state.scale * factor));
    state.x = cx - (cx - state.x) * scale / state.scale;
    state.y = cy - (cy - state.y) * scale / state.scale;
    state.scale = scale; transform();
  }

  function highlightSelection() {
    const related = new Set([state.selected]);
    links.forEach(l => { if (l.source === state.selected || l.target === state.selected) { related.add(l.source); related.add(l.target); } });
    $$('.node').forEach(n => { n.classList.toggle('selected', n.dataset.person === state.selected); n.classList.toggle('dimmed', !!state.selected && !related.has(n.dataset.person)); });
    $$('.edge').forEach(e => { const active = e.dataset.source === state.selected || e.dataset.target === state.selected; e.classList.toggle('highlighted', active); e.classList.toggle('dimmed', !!state.selected && !active); });
  }

  function openProfile(id, focusClose = true) {
    const p = byId.get(id); if (!p) return;
    if (!state.selected) previousProfileFocus = document.activeElement;
    state.selected = id;
    const f = fieldOf(p), incoming = links.filter(l => l.target === id), outgoing = links.filter(l => l.source === id);
    const connectionHTML = (arr, incoming) => arr.map(l => { const person = byId.get(incoming ? l.source : l.target); return `<button class="connection-link" data-person="${person.id}"><span>${esc(person.name)}<small>${esc(l.label)}</small></span>${icon('arrow')}</button>`; }).join('');
    const allSources = [...(p.sources || []), ...[...incoming, ...outgoing].flatMap(l => l.sources || [])].filter((s, i, a) => a.findIndex(t => t.url === s.url) === i);
    $('#profile-panel').innerHTML = `<button class="icon-button profile-close" aria-label="Close researcher details">${icon('close')}</button><div class="profile-avatar" style="--field:${f.color}">${esc(initials(p))}</div><h2>${esc(p.name)}</h2>${p.nativeName ? `<p class="native-name" lang="ru">${esc(p.nativeName)}</p>` : ''}<span class="field-pill" style="--field:${f.color}"><span class="field-dot"></span>${f.name}</span><dl class="profile-facts"><dt>Degree</dt><dd>${esc(p.degree)}</dd><dt>Affiliation</dt><dd>${esc(p.affiliation)}</dd></dl><div class="profile-section"><h3>RESEARCH INTERESTS</h3><p>${esc(p.interests)}</p>${p.note ? `<p class="profile-note">${esc(p.note)}</p>` : ''}</div>${incoming.length ? `<div class="profile-section"><h3>SUPERVISED BY</h3>${connectionHTML(incoming, true)}</div>` : ''}${outgoing.length ? `<div class="profile-section"><h3>ADVISEES IN THIS COLLECTION · ${outgoing.length}</h3>${connectionHTML(outgoing, false)}</div>` : ''}${!incoming.length && !outgoing.length ? '<div class="profile-section"><p class="profile-note">No supervision links have been documented in this collection yet.</p></div>' : ''}<button class="primary-button" id="focus-lineage">${icon('tree')}Explore this lineage</button><div class="profile-section"><h3>PROFILE & CONNECTION SOURCES</h3>${sourcesHTML(allSources)}</div>`;
    $('#profile-panel').hidden = false;
    highlightSelection();
    if (focusClose) $('.profile-close').focus({ preventScroll: true });
  }

  function closeProfile(restoreFocus = true) {
    state.selected = null; $('#profile-panel').hidden = true; highlightSelection();
    if (restoreFocus && previousProfileFocus?.isConnected) previousProfileFocus.focus({ preventScroll: true });
    previousProfileFocus = null;
  }

  function focusLineage() {
    const selected = state.selected;
    const family = new Set([selected]), queue = [selected];
    while (queue.length) {
      const id = queue.shift();
      links.forEach(l => { const other = l.source === id ? l.target : l.target === id ? l.source : null; if (other && !family.has(other)) { family.add(other); queue.push(other); } });
    }
    clearFilters(false); state.focus = family; closeProfile(); setView('tree'); update(); fitView();
    showToast(`Showing ${byId.get(selected).name.split(' ').at(-1)}’s connected lineage. Use Reset to return to everyone.`);
  }

  function clearFilters(render = true) {
    state.field = 'all'; state.institutions.clear(); state.stages.clear(); state.showHistory = false; state.query = ''; state.focus = null;
    $('#search').value = ''; $$('.filters input').forEach(i => i.checked = false);
    if (render) { closeProfile(); update(); }
  }

  function setView(view) {
    state.view = view;
    $$('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-selected', String(b.dataset.view === view)); b.tabIndex = b.dataset.view === view ? 0 : -1; });
    $('#graph-view').hidden = view !== 'tree'; $('#directory-view').hidden = view !== 'directory';
    if (view === 'tree') requestAnimationFrame(() => renderGraph());
  }

  function setTab(tab) {
    closeProfile(false);
    for (const t of ['explore', 'sources']) $(`#${t}-section`).hidden = t !== tab;
    if (tab === 'explore') requestAnimationFrame(() => renderGraph());
  }

  function renderSources() {
    $('#sources-list').innerHTML = [...people].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
      const related = links.filter(l => l.source === p.id || l.target === p.id);
      const sources = [...p.sources, ...related.flatMap(l => l.sources || [])].filter((s, i, a) => a.findIndex(t => t.url === s.url) === i);
      return `<article class="reference-card"><div><h3>${esc(p.name)}</h3><p>${esc(stageLabel(p))}</p></div><div>${sourcesHTML(sources)}${p.note ? `<p>${esc(p.note)}</p>` : ''}${related.map(l => `<p>${esc(byId.get(l.source).name)} → ${esc(byId.get(l.target).name)} · ${esc(l.label)}${l.note ? `. ${esc(l.note)}` : ''}</p>`).join('')}</div></article>`;
    }).join('');
  }

  let toastTimer;
  function showToast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }

  document.addEventListener('click', event => {
    const person = event.target.closest('[data-person]');
    if (person) { if (!suppressClick) openProfile(person.dataset.person); return; }
    const field = event.target.closest('[data-field]');
    if (field) { state.field = field.dataset.field; state.focus = null; closeProfile(); update(); return; }
    const view = event.target.closest('[data-view]'); if (view) { closeProfile(); setView(view.dataset.view); return; }
    const tab = event.target.closest('[data-tab]'); if (tab) { setTab(tab.dataset.tab); return; }
    if (event.target.closest('.profile-close')) closeProfile();
    if (event.target.closest('#focus-lineage')) focusLineage();
  });
  $$('.filters input[name]').forEach(input => input.addEventListener('change', () => { const set = input.name === 'institution' ? state.institutions : state.stages; if (input.checked) set.add(input.value); else set.delete(input.value); state.focus = null; closeProfile(); update(); }));
  $('#show-history').addEventListener('change', e => { state.showHistory = e.target.checked; closeProfile(false); update(); });
  $('#search').addEventListener('input', e => { state.query = e.target.value; state.focus = null; closeProfile(false); update(); if (state.visible.length && state.visible.length <= 6) fitView(); });
  $('#reset-filters').addEventListener('click', () => clearFilters());
  $('#empty-reset').addEventListener('click', () => clearFilters());
  $('#zoom-in').addEventListener('click', () => zoom(1.2));
  $('#zoom-out').addEventListener('click', () => zoom(1 / 1.2));
  $('#fit-view').addEventListener('click', fitView);
  $('#reset-view').addEventListener('click', resetView);
  $('#toggle-filters').addEventListener('click', () => { const open = $('#filters').classList.toggle('open'); $('#toggle-filters').setAttribute('aria-expanded', String(open)); });
  $('#fullscreen-button').addEventListener('click', () => { const expanded = $('.workspace').classList.toggle('expanded-workspace'); $('#fullscreen-button').setAttribute('aria-label', expanded ? 'Exit expanded explorer' : 'Expand explorer'); document.body.style.overflow = expanded ? 'hidden' : ''; requestAnimationFrame(() => { if (state.view === 'tree') { renderGraph(); fitView(); } }); });

  canvas.addEventListener('wheel', event => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0018), event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
  const pointers = new Map();
  let drag = null, suppressClick = false, pinch = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.target.closest('.canvas-controls,.empty-state') || e.button > 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null;
    } else { suppressClick = false; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: state.x, startY: state.y }; }
  });
  window.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y), rect = canvas.getBoundingClientRect();
      zoom(distance / Math.max(1, pinch.distance), (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top); pinch.distance = distance; suppressClick = true; return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) { suppressClick = true; canvas.classList.add('dragging'); if (!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId); }
    if (suppressClick) { state.x = drag.startX + dx; state.y = drag.startY + dy; transform(); }
  });
  function endPointer(e) { pointers.delete(e.pointerId); drag = null; pinch = null; canvas.classList.remove('dragging'); setTimeout(() => { suppressClick = false; }, 0); }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeProfile(); $('#filters').classList.remove('open'); $('#toggle-filters').setAttribute('aria-expanded', 'false'); if ($('.workspace').classList.contains('expanded-workspace')) $('#fullscreen-button').click(); return; }
    if (e.target.matches('input,textarea')) return;
    if (e.target.matches('[data-view]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const view = e.key === 'Home' ? 'tree' : e.key === 'End' ? 'directory' : state.view === 'tree' ? 'directory' : 'tree';
      closeProfile(false); setView(view); $(`[data-view="${view}"]`).focus(); return;
    }
    if (e.key === '/') { e.preventDefault(); setTab('explore'); $('#search').focus(); }
    if (document.activeElement === canvas) {
      const delta = { ArrowLeft: [45, 0], ArrowRight: [-45, 0], ArrowUp: [0, 45], ArrowDown: [0, -45] }[e.key];
      if (delta) { e.preventDefault(); state.x += delta[0]; state.y += delta[1]; transform(); }
      if (['+', '='].includes(e.key)) { e.preventDefault(); zoom(1.2); }
      if (e.key === '-') { e.preventDefault(); zoom(1 / 1.2); }
      if (e.key === '0') { e.preventDefault(); fitView(); }
    }
  });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.view === 'tree' && !$('#explore-section').hidden) renderGraph(); }, 150); });

  $('#directory-tab').tabIndex = -1;
  renderSources(); update();
})();
