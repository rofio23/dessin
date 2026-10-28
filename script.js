(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const stage = document.getElementById('stage');

  const colorInput = document.getElementById('color');
  const sizeInput = document.getElementById('size');
  const opacityInput = document.getElementById('opacity');
  const capInput = document.getElementById('cap');
  const fillShape = document.getElementById('fillShape');
  const bgInput = document.getElementById('bg');

  const PALETTE = ['#1f2a44','#d93a3a','#f08a24','#f2c82e','#3fa34d','#2f5fd0',
                   '#7a3fc4','#e0569a','#8a5a3c','#808080','#000000','#ffffff'];

  let tool = 'brush', drawing = false, start = null, last = null;
  let snapshot = null, undoStack = [], redoStack = [];
  let bgColor = '#ffffff';

  // Canvas size & setup
  function resize(keep) {
    const saved = keep ? canvas.toDataURL() : null;
    const w = Math.max(300, Math.floor(stage.clientWidth - 36));
    const h = Math.max(300, Math.floor(stage.clientHeight - 36));
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, w, h);
    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = saved;
    }
  }
  resize(false);
  pushUndo();

  // Palette
  const sw = document.getElementById('swatches');
  PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.title = c;
    b.addEventListener('click', () => setColor(c));
    sw.appendChild(b);
  });
  function setColor(c) {
    colorInput.value = c;
    sw.querySelectorAll('.swatch').forEach(s =>
      s.classList.toggle('active', s.title.toLowerCase() === c.toLowerCase()));
    if (tool === 'eraser') setTool('brush');
  }
  colorInput.addEventListener('input', e => setColor(e.target.value));
  setColor(colorInput.value);

  // Tools
  function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === t));
  }
  document.querySelectorAll('.tool').forEach(b =>
    b.addEventListener('click', () => setTool(b.dataset.tool)));

  sizeInput.addEventListener('input', () => document.getElementById('sizeOut').textContent = sizeInput.value);
  opacityInput.addEventListener('input', () => document.getElementById('opacityOut').textContent = opacityInput.value);

  bgInput.addEventListener('input', () => {
    // remplace l'ancien fond par le nouveau (les pixels de l'ancienne couleur)
    const old = hexToRgb(bgColor), nw = hexToRgb(bgInput.value);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === old[0] && d[i+1] === old[1] && d[i+2] === old[2]) {
        d[i] = nw[0]; d[i+1] = nw[1]; d[i+2] = nw[2];
      }
    }
    ctx.putImageData(img, 0, 0);
    bgColor = bgInput.value;
  });
  bgInput.addEventListener('change', pushUndo);

  // Drawing
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width,
             y: (e.clientY - r.top) * canvas.height / r.height };
  }
  function style() {
    ctx.lineWidth = +sizeInput.value;
    ctx.lineCap = capInput.value;
    ctx.lineJoin = capInput.value === 'round' ? 'round' : 'miter';
    ctx.globalAlpha = tool === 'eraser' ? 1 : opacityInput.value / 100;
    const c = tool === 'eraser' ? bgColor : colorInput.value;
    ctx.strokeStyle = c; ctx.fillStyle = c;
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (tool === 'fill') { floodFill(Math.floor(p.x), Math.floor(p.y)); pushUndo(); return; }
    drawing = true; start = last = p;
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (tool === 'brush' || tool === 'eraser') {
      style(); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .01, p.y + .01); ctx.stroke();
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    if (tool === 'brush' || tool === 'eraser') {
      // opacité < 100 : on redessine le trait entier pour éviter les taches
      if (!stroke) stroke = [start];
      stroke.push(p);
      ctx.putImageData(snapshot, 0, 0);
      style(); ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 1; i++) {
        const m = { x: (stroke[i].x + stroke[i+1].x) / 2, y: (stroke[i].y + stroke[i+1].y) / 2 };
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, m.x, m.y);
      }
      ctx.lineTo(p.x, p.y); ctx.stroke();
    } else {
      ctx.putImageData(snapshot, 0, 0);
      style(); drawShape(start, p);
    }
    last = p;
  });
  let stroke = null;

  function end() {
    if (!drawing) return;
    drawing = false; stroke = null; ctx.globalAlpha = 1; pushUndo();
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function drawShape(a, b) {
    ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    if (tool === 'rect') ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (tool === 'circle') {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    }
    if (fillShape.checked && tool !== 'line') ctx.fill();
    ctx.stroke();
  }

  // Pot de peinture
  function hexToRgb(h) {
    return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  function floodFill(sx, sy) {
    const w = canvas.width, h = canvas.height;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const idx = (x, y) => (y * w + x) * 4;
    const i0 = idx(sx, sy);
    const target = [d[i0], d[i0+1], d[i0+2]];
    const fill = hexToRgb(colorInput.value);
    if (target.every((v, k) => v === fill[k])) return;
    const tol = 24;
    const match = i => Math.abs(d[i]-target[0]) + Math.abs(d[i+1]-target[1]) + Math.abs(d[i+2]-target[2]) <= tol;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      let xx = x;
      while (xx >= 0 && match(idx(xx, y))) xx--;
      xx++;
      let up = false, down = false;
      while (xx < w && match(idx(xx, y))) {
        const i = idx(xx, y);
        d[i] = fill[0]; d[i+1] = fill[1]; d[i+2] = fill[2]; d[i+3] = 255;
        if (y > 0) { const m = match(idx(xx, y-1)); if (m && !up) { stack.push([xx, y-1]); up = true; } else if (!m) up = false; }
        if (y < h-1) { const m = match(idx(xx, y+1)); if (m && !down) { stack.push([xx, y+1]); down = true; } else if (!m) down = false; }
        xx++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Historique
  function pushUndo() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
  }
  function redo() {
    if (!redoStack.length) return;
    const s = redoStack.pop(); undoStack.push(s); ctx.putImageData(s, 0, 0);
  }
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
  document.getElementById('clear').addEventListener('click', () => {
    ctx.globalAlpha = 1; ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height); pushUndo();
  });
  document.getElementById('save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'dessin.png'; a.href = canvas.toDataURL('image/png'); a.click();
  });

  // Raccourcis clavier
  addEventListener('keydown', e => {
    if (e.target.matches('input, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    const map = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', c: 'circle', f: 'fill' };
    if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
    if (e.key === '[') { sizeInput.value = Math.max(1, +sizeInput.value - 2); sizeInput.dispatchEvent(new Event('input')); }
    if (e.key === ']') { sizeInput.value = Math.min(80, +sizeInput.value + 2); sizeInput.dispatchEvent(new Event('input')); }
  });
})();

