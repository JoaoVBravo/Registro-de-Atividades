/*
  =====================================================================
  BLOCO DE ATIVIDADES - LOGICA (JavaScript)
  =====================================================================
  Indice:
    1. Configuracao e estado
    2. Funcoes auxiliares
    3. Banco de dados (localStorage) e migracao
    4. Desenho da tela (render)
    5. Janelas flutuantes (menu de tags e nota post-it)
    6. Exportacao (TXT, CSV, download)
    7. Eventos (botoes e campos)
    8. Importacao (JSON, CSV, TXT)
    9. Inicio

  COMO OS DADOS SAO GUARDADOS
  Tudo fica em um unico objeto chamado "db", salvo no navegador
  (localStorage) com a chave KEY. Formato:

    db = {
      tags:  [ { id: 't1abc', name: 'Reuniao', color: '#2563eb' } ],
      days:  {
        '2026-11-24': {
          hours: {
            '7': {                              // bloco 07:00 - 08:00
              acts: [                           // lista de atividades da hora
                { text: 'Revisei chamados',     // texto da atividade
                  tags: ['t1abc'],              // ids das tags aplicadas
                  note: 'Detalhes do post-it' } // nota (post-it)
              ]
            }
          },
          extra: [19]          // blocos extras adicionados neste dia
        }
      },
      start: 7,                // inicio do expediente
      end:   18,               // fim do expediente
      dark:  false             // tema escuro ligado?
    }

  A chave de cada hora e o numero da hora de inicio (7 = 07:00 as 08:00).

  VERSAO ANTIGA: antes, cada hora guardava { text, tags } direto, sem lista
  de atividades. A funcao normalizeBlock() converte isso automaticamente
  para o formato novo ao carregar os dados. Nada e perdido.
  =====================================================================
*/

'use strict';


/* =====================================================================
   1. CONFIGURACAO E ESTADO
   ===================================================================== */

/* Nome sob o qual os dados ficam salvos no navegador.
   ATENCAO: se mudar este nome, os dados ja salvos "somem" (continuam no
   navegador, mas o programa passa a ler outro lugar). Nao mude sem motivo. */
const KEY = 'bloco_atividades_v1';

/* Atalho: $('prev') equivale a document.getElementById('prev') */
const $ = id => document.getElementById(id);

/* Dados carregados do navegador */
let db = load();

/* Dia que esta aberto na tela, no formato 'AAAA-MM-DD' */
let cur = todayStr();

/* Nota (post-it) atualmente aberta: { h, idx, btn } ou null */
let noteCtx = null;

/* Depois de adicionar uma atividade, guarda onde colocar o cursor: { h, idx } */
let focusTarget = null;


/* =====================================================================
   2. FUNCOES AUXILIARES
   Importante: sao declaradas com "function" (e nao "const") para existirem
   desde o inicio do script, pois a secao 1 ja chama algumas delas.
   ===================================================================== */

/* Coloca zero a esquerda. Exemplo: p2(7) devolve '07' */
function p2(n) {
  return String(n).padStart(2, '0');
}

/* Data de hoje como 'AAAA-MM-DD'. Exemplo: '2026-11-24' */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

/* Gera um id unico para tags. Exemplo: 'tmabc12xy' */
function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* Texto do horario de um bloco. Exemplo: label(7) devolve '07:00 - 08:00' */
function label(h) {
  return p2(h) + ':00 - ' + p2(h + 1) + ':00';
}

/* Data por extenso. Exemplo: 'terca-feira, 24 de novembro de 2026' */
function fmtDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

/* Protege textos antes de colocar na tela (evita que '<' vire HTML) */
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}

/* Procura uma tag pelo id */
function tagById(id) {
  return db.tags.find(t => t.id === id);
}

/* Devolve os nomes das tags de uma atividade. Exemplo: ['Reuniao', 'Suporte'] */
function tagNames(a) {
  return (a.tags || [])
    .map(i => { const t = tagById(i); return t ? t.name : null; })
    .filter(Boolean);
}

/* Cria uma atividade vazia */
function newAct() {
  return { text: '', tags: [], note: '' };
}

/* Uma atividade conta como "preenchida" se tiver texto, nota ou alguma tag */
function isActFilled(a) {
  return !!a && !!((a.text && a.text.trim()) || (a.note && a.note.trim()) || (a.tags && a.tags.length));
}

/* Um bloco de hora conta como "preenchido" se alguma atividade estiver preenchida */
function isFilled(b) {
  return !!b && Array.isArray(b.acts) && b.acts.some(isActFilled);
}


/* =====================================================================
   3. BANCO DE DADOS (localStorage) E MIGRACAO
   ===================================================================== */

/* Le os dados salvos. Se nao houver nada, cria um banco novo e vazio.
   Exemplo: para mudar o expediente padrao de um banco novo para 08-17,
   troque start: 7, end: 18 por start: 8, end: 17. */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.days) return migrate(d);
  } catch (e) { /* dados corrompidos: ignora e comeca vazio */ }
  return { tags: [], days: {}, start: 7, end: 18, dark: false };
}

/* Salva o banco no navegador. Chamada depois de qualquer alteracao. */
function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

/* Converte um bloco do formato antigo { text, tags } para o novo { acts: [...] }.
   Blocos que ja estao no formato novo passam sem alteracao. */
function normalizeBlock(b) {
  if (!Array.isArray(b.acts)) {
    const filled = (b.text && b.text.trim()) || (b.tags && b.tags.length);
    b.acts = filled ? [{ text: b.text || '', tags: b.tags || [], note: '' }] : [];
  }
  delete b.text;
  delete b.tags;
  b.acts.forEach(a => {
    if (typeof a.text !== 'string') a.text = '';
    if (typeof a.note !== 'string') a.note = '';
    if (!Array.isArray(a.tags)) a.tags = [];
  });
  return b;
}

/* Garante que um banco (carregado ou importado) esteja no formato atual */
function migrate(d) {
  if (!Array.isArray(d.tags)) d.tags = [];
  if (typeof d.start !== 'number') d.start = 7;
  if (typeof d.end !== 'number') d.end = 18;
  Object.values(d.days).forEach(dd => {
    if (!dd.hours) dd.hours = {};
    if (!Array.isArray(dd.extra)) dd.extra = [];
    Object.values(dd.hours).forEach(normalizeBlock);
  });
  return d;
}

/* Devolve os dados de um dia. Com create=true, cria o dia se nao existir. */
function day(d, create) {
  if (!db.days[d] && create) db.days[d] = { hours: {}, extra: [] };
  return db.days[d];
}

/* Devolve a atividade numero idx (comecando em 0) da hora h do dia d.
   Com create=true, cria o bloco e as atividades que faltarem. */
function getAct(d, h, idx, create) {
  const dd = day(d, create);
  if (!dd) return null;
  let b = dd.hours[h];
  if (!b) {
    if (!create) return null;
    b = dd.hours[h] = { acts: [] };
  }
  while (create && b.acts.length <= idx) b.acts.push(newAct());
  return b.acts[idx] || null;
}

/* Lista as horas que aparecem na tela em um dia:
   expediente + blocos extras + qualquer hora que ja tenha conteudo.
   (Assim, mudar o expediente nunca esconde um registro antigo.) */
function hoursOf(d) {
  const set = new Set();
  for (let h = db.start; h < db.end; h++) set.add(h);
  const dd = day(d);
  if (dd) {
    (dd.extra || []).forEach(h => set.add(h));
    Object.keys(dd.hours).forEach(k => {
      if (isFilled(dd.hours[k])) set.add(+k);
    });
  }
  return [...set].sort((a, b) => a - b);
}


/* =====================================================================
   4. DESENHO DA TELA (render)
   Estas funcoes montam o HTML dinamico a partir dos dados.
   ===================================================================== */

/* Redesenha tudo. Chamada depois de mudar de dia, tag, tema etc. */
function render() {
  document.body.classList.toggle('dark', !!db.dark);   /* aplica o tema */
  $('date').value = cur;
  $('dayTitle').textContent = fmtDate(cur);
  $('startH').value = db.start;
  $('endH').value = db.end;
  renderBlocks();
  renderTags();
  renderSummary();
  renderExtra();
}

/* Desenha os blocos de 1 hora do dia aberto.
   Cada bloco tem: coluna do horario + lista de atividades + botao "+ Adicionar atividade". */
function renderBlocks() {
  closePopups();
  const box = $('blocks');
  box.innerHTML = '';
  const dd = day(cur);

  hoursOf(cur).forEach(h => {
    const b = dd && dd.hours[h];
    /* Se o bloco ainda nao tem atividade, mostra uma vazia (so e salva ao digitar) */
    const acts = (b && b.acts.length) ? b.acts : [newAct()];

    const el = document.createElement('div');
    el.className = 'block';

    const time = document.createElement('div');
    time.className = 'time';
    time.innerHTML = p2(h) + ':00<small>ate ' + p2(h + 1) + ':00</small>';

    const col = document.createElement('div');
    col.className = 'acts';
    acts.forEach((a, idx) => col.appendChild(buildAct(h, idx, a, acts.length)));

    /* Barra do bloco: adicionar atividade (e remover bloco, se for extra) */
    const bar = document.createElement('div');
    bar.className = 'blockbar';

    const add = document.createElement('button');
    add.className = 'sm';
    add.textContent = '+ Adicionar atividade';
    add.onclick = () => {
      const d = day(cur, true);
      const blk = d.hours[h] || (d.hours[h] = { acts: [] });
      if (!blk.acts.length) blk.acts.push(newAct());   /* materializa a atividade vazia */
      blk.acts.push(newAct());
      focusTarget = { h: h, idx: blk.acts.length - 1 };
      save();
      renderBlocks();
    };
    bar.appendChild(add);

    /* E um bloco extra (fora do expediente) que pode ser removido? */
    const isExtra = dd && (dd.extra || []).includes(h) && !(h >= db.start && h < db.end);
    if (isExtra) {
      const rm = document.createElement('button');
      rm.className = 'sm';
      rm.textContent = 'Remover bloco';
      rm.onclick = () => {
        const d = day(cur, true);
        d.extra = d.extra.filter(e => e !== h);
        delete d.hours[h];
        save();
        render();
      };
      bar.appendChild(rm);
    }

    col.appendChild(bar);
    el.append(time, col);
    box.appendChild(el);
  });
}

/* Monta o quadro de UMA atividade (h = hora, idx = posicao na hora, a = dados).
   Tem: caixa de texto, tags aplicadas (aparecem so se existirem),
   botao "+ tag", botao "Nota" (post-it) e botao "Remover" (quando ha mais de uma). */
function buildAct(h, idx, a, total) {
  const el = document.createElement('div');
  el.className = 'act';

  /* Caixa de texto: salva a cada tecla digitada */
  const ta = document.createElement('textarea');
  ta.placeholder = 'Descreva a atividade...';
  ta.value = a.text || '';
  ta.addEventListener('input', () => {
    getAct(cur, h, idx, true).text = ta.value;
    save();
    renderSummary();
  });
  el.appendChild(ta);

  /* Barra da atividade */
  const bar = document.createElement('div');
  bar.className = 'actbar';

  /* Tags aplicadas: so aparecem as que foram atribuidas a esta atividade.
     Clicar no "x" remove a tag desta atividade. */
  (a.tags || []).forEach(id => {
    const t = tagById(id);
    if (!t) return;
    const c = document.createElement('span');
    c.className = 'chip on';
    c.style.borderColor = t.color;
    c.style.background = t.color;
    c.appendChild(document.createTextNode(t.name + ' '));
    const x = document.createElement('b');
    x.className = 'chipx';
    x.textContent = 'x';
    x.title = 'Remover tag desta atividade';
    x.onclick = () => {
      const act = getAct(cur, h, idx, true);
      act.tags = act.tags.filter(i => i !== id);
      save();
      renderBlocks();
      renderSummary();
    };
    c.appendChild(x);
    bar.appendChild(c);
  });

  /* Botao + tag: abre o menu com as tags que ainda nao foram aplicadas */
  const tagBtn = document.createElement('button');
  tagBtn.className = 'sm';
  tagBtn.textContent = '+ tag';
  tagBtn.onclick = e => { e.stopPropagation(); openTagMenu(tagBtn, h, idx); };
  bar.appendChild(tagBtn);

  /* Botao Nota: abre o post-it. Fica destacado (amarelo) quando ja existe nota. */
  const noteBtn = document.createElement('button');
  noteBtn.className = 'sm notebtn' + (a.note && a.note.trim() ? ' has' : '');
  noteBtn.textContent = 'Nota';
  noteBtn.onclick = e => { e.stopPropagation(); openPostit(noteBtn, el, h, idx); };
  bar.appendChild(noteBtn);

  /* Remover atividade: so aparece quando a hora tem mais de uma */
  if (total > 1) {
    const rm = document.createElement('button');
    rm.className = 'sm';
    rm.textContent = 'Remover';
    rm.onclick = () => {
      const act = getAct(cur, h, idx, false);
      if (isActFilled(act) && !confirm('Remover esta atividade?')) return;
      day(cur, true).hours[h].acts.splice(idx, 1);
      save();
      renderBlocks();
      renderSummary();
    };
    bar.appendChild(rm);
  }

  el.appendChild(bar);

  /* Coloca o cursor na atividade recem criada */
  if (focusTarget && focusTarget.h === h && focusTarget.idx === idx) {
    focusTarget = null;
    setTimeout(() => ta.focus(), 0);
  }
  return el;
}

/* Desenha a lista de tags da barra lateral (cor, nome, renomear, excluir) */
function renderTags() {
  const box = $('tagList');
  box.innerHTML = '';
  if (!db.tags.length) {
    box.innerHTML = '<span class="muted">Nenhuma tag ainda. Crie tags aqui.</span>';
  }

  db.tags.forEach(t => {
    const r = document.createElement('div');
    r.className = 'tagrow';

    /* Seletor de cor */
    const col = document.createElement('input');
    col.type = 'color';
    col.value = t.color;
    col.onchange = () => { t.color = col.value; save(); render(); };

    /* Nome */
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = t.name;
    nm.style.color = t.color;
    nm.style.fontWeight = '600';

    /* Renomear */
    const ren = document.createElement('button');
    ren.className = 'sm';
    ren.textContent = 'Renomear';
    ren.onclick = () => {
      const n = prompt('Novo nome da tag:', t.name);
      if (n && n.trim()) { t.name = n.trim(); save(); render(); }
    };

    /* Excluir: remove a tag da lista E de todas as atividades de todos os dias */
    const del = document.createElement('button');
    del.className = 'sm';
    del.textContent = 'Excluir';
    del.onclick = () => {
      if (!confirm('Excluir a tag "' + t.name + '" de todas as atividades?')) return;
      db.tags = db.tags.filter(x => x.id !== t.id);
      Object.values(db.days).forEach(d =>
        Object.values(d.hours).forEach(b =>
          b.acts.forEach(a => { a.tags = a.tags.filter(i => i !== t.id); })
        )
      );
      save();
      render();
    };

    r.append(col, nm, ren, del);
    box.appendChild(r);
  });
}

/* Desenha o resumo do dia: horas com registro, total de atividades
   e quantas atividades usam cada tag. */
function renderSummary() {
  const box = $('summary');
  const dd = day(cur);
  const cnt = {};
  let horas = 0, atividades = 0;

  if (dd) {
    Object.values(dd.hours).forEach(b => {
      if (isFilled(b)) horas++;
      b.acts.forEach(a => {
        if (!isActFilled(a)) return;
        atividades++;
        a.tags.forEach(i => cnt[i] = (cnt[i] || 0) + 1);
      });
    });
  }

  let html = '<div class="sum"><span>Horas com registro</span><b>' + horas + '</b></div>' +
             '<div class="sum"><span>Atividades</span><b>' + atividades + '</b></div>';
  Object.keys(cnt).forEach(i => {
    const t = tagById(i);
    if (!t) return;
    html += '<div class="sum"><span style="color:' + t.color + ';font-weight:600">' +
            esc(t.name) + '</span><b>' + cnt[i] + '</b></div>';
  });
  box.innerHTML = html;
}

/* Monta a lista de horas disponiveis para "Bloco extra" (so as que nao aparecem ainda) */
function renderExtra() {
  const s = $('extraSel');
  s.innerHTML = '';
  const shown = new Set(hoursOf(cur));
  for (let h = 0; h < 24; h++) {
    if (!shown.has(h)) s.innerHTML += '<option value="' + h + '">' + label(h) + '</option>';
  }
  s.disabled = !s.options.length;
}


/* =====================================================================
   5. JANELAS FLUTUANTES (menu de tags e nota post-it)
   Os elementos #tagMenu e #postit ficam no index.html, escondidos.
   ===================================================================== */

/* Fecha o menu de tags e o post-it */
function closePopups() {
  $('tagMenu').hidden = true;
  $('postit').hidden = true;
  noteCtx = null;
}

/* Abre o menu de tags logo abaixo do botao "+ tag".
   Mostra apenas as tags que ainda nao foram aplicadas a esta atividade. */
function openTagMenu(btn, h, idx) {
  closePopups();
  const menu = $('tagMenu');
  menu.innerHTML = '';

  const act = getAct(cur, h, idx, false);
  const applied = act ? act.tags : [];
  const avail = db.tags.filter(t => !applied.includes(t.id));

  if (!db.tags.length) {
    menu.innerHTML = '<div class="muted pad">Nenhuma tag criada. Crie na barra lateral.</div>';
  } else if (!avail.length) {
    menu.innerHTML = '<div class="muted pad">Todas as tags ja foram aplicadas.</div>';
  } else {
    avail.forEach(t => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = t.name;
      c.style.borderColor = t.color;
      c.style.color = t.color;
      c.onclick = () => {
        getAct(cur, h, idx, true).tags.push(t.id);
        save();
        renderBlocks();
        renderSummary();
      };
      menu.appendChild(c);
    });
  }

  const r = btn.getBoundingClientRect();
  menu.style.left = (r.left + window.scrollX) + 'px';
  menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
  menu.hidden = false;
}

/* Abre o post-it ao lado do quadro da atividade.
   Clicar de novo no mesmo botao Nota fecha o post-it.
   Exemplo: para mudar a largura do post-it, altere .postit no style.css. */
function openPostit(btn, anchor, h, idx) {
  const mesmo = noteCtx && noteCtx.h === h && noteCtx.idx === idx;
  closePopups();
  if (mesmo) return;

  noteCtx = { h: h, idx: idx, btn: btn };
  const act = getAct(cur, h, idx, false);
  $('postitTitle').textContent = 'Nota - ' + p2(h) + ':00, atividade ' + (idx + 1);
  $('postitText').value = act ? (act.note || '') : '';

  const pop = $('postit');
  pop.hidden = false;

  /* Posiciona ao lado direito do quadro, sem sair da tela */
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - w - 8;
  let left = r.right + window.scrollX + 8;
  if (left > maxLeft) left = maxLeft;
  pop.style.left = Math.max(left, window.scrollX + 4) + 'px';
  pop.style.top = (r.top + window.scrollY) + 'px';
  $('postitText').focus();
}


/* =====================================================================
   6. EXPORTACAO (TXT, CSV, DOWNLOAD)
   ===================================================================== */

/* Indenta cada linha de um texto. Exemplo: ind('a\nb', '    ') devolve '    a\n    b' */
function ind(s, pad) {
  return String(s).split(/\r?\n/).map(l => pad + l).join('\n');
}

/* Monta o texto do dia (usado em "Copiar dia" e "TXT do dia").
   Exemplo de saida:

     07:00 - 08:00
       Atividade 1 [Reuniao, Suporte]
         Alinhamento com a equipe
         Nota: pontos combinados na reuniao
       Atividade 2
         Respondi chamados

   ATENCAO: o formato (recuos e palavras "Atividade" e "Nota:") e lido de volta
   pela importacao de TXT. Se mudar aqui, ajuste parseTxtEntries tambem. */
function dayText(d) {
  const dd = day(d);
  let out = 'Registro de atividades - ' + fmtDate(d) + '\n' + '='.repeat(40) + '\n';
  hoursOf(d).forEach(h => {
    const b = dd && dd.hours[h];
    if (!isFilled(b)) return;
    out += '\n' + label(h) + '\n';
    let n = 0;
    b.acts.forEach(a => {
      if (!isActFilled(a)) return;
      n++;
      const tg = tagNames(a);
      out += '  Atividade ' + n + (tg.length ? ' [' + tg.join(', ') + ']' : '') + '\n';
      if (a.text && a.text.trim()) out += ind(a.text.trim(), '    ') + '\n';
      if (a.note && a.note.trim()) {
        const linhas = a.note.trim().split(/\r?\n/);
        out += '    Nota: ' + linhas[0] + '\n';
        linhas.slice(1).forEach(l => { out += '    ' + l + '\n'; });
      }
    });
  });
  return out;
}

/* Protege uma celula do CSV (aspas duplas). Quebras de linha sao mantidas
   dentro das aspas, o que o Excel aceita. */
function csvCell(s) {
  return '"' + String(s).replace(/"/g, '""').replace(/\r\n?/g, '\n') + '"';
}

/* Monta o CSV de uma lista de datas: uma linha por ATIVIDADE.
   Separador ';' porque o Excel em portugues abre assim direto.
   '\ufeff' no inicio garante acentos corretos no Excel.
   Para mudar as colunas, altere a lista do cabecalho e a linha de dados
   (e a leitura em parseCsvEntries, para a importacao continuar funcionando). */
function csvFor(dates) {
  const rows = [['Data', 'Inicio', 'Fim', 'Tags', 'Atividade', 'Nota'].map(csvCell).join(';')];
  dates.forEach(d => {
    const dd = day(d);
    if (!dd) return;
    hoursOf(d).forEach(h => {
      const b = dd.hours[h];
      if (!isFilled(b)) return;
      b.acts.forEach(a => {
        if (!isActFilled(a)) return;
        const [y, m, x] = d.split('-');
        rows.push([
          x + '/' + m + '/' + y,
          p2(h) + ':00',
          p2(h + 1) + ':00',
          tagNames(a).join(', '),
          (a.text || '').trim(),
          (a.note || '').trim()
        ].map(csvCell).join(';'));
      });
    });
  });
  return '\ufeff' + rows.join('\r\n');
}

/* Baixa um arquivo. Exemplo: download('teste.txt', 'ola', 'text/plain') */
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}


/* =====================================================================
   7. EVENTOS (botoes e campos)
   Padrao:  $('idDoElemento').onclick = () => { ...o que fazer... };
   Os ids estao definidos no index.html.
   ===================================================================== */

/* ---- Navegacao entre dias ---- */

/* Escolher data no calendario */
$('date').onchange = () => {
  if ($('date').value) { cur = $('date').value; render(); }
};

/* Anda n dias. Exemplo: shift(-1) = dia anterior, shift(7) = semana seguinte */
function shift(n) {
  const [y, m, d] = cur.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  cur = dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate());
  render();
}
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('today').onclick = () => { cur = todayStr(); render(); };

/* ---- Tema claro/escuro ---- */
$('theme').onclick = () => { db.dark = !db.dark; save(); render(); };

/* ---- Janelas flutuantes ---- */

/* Digitar no post-it salva a nota da atividade correspondente */
$('postitText').oninput = () => {
  if (!noteCtx) return;
  const a = getAct(cur, noteCtx.h, noteCtx.idx, true);
  a.note = $('postitText').value;
  save();
  noteCtx.btn.classList.toggle('has', !!a.note.trim());   /* destaca o botao Nota */
  renderSummary();
};
$('postitClose').onclick = closePopups;

/* Clicar fora do menu de tags fecha o menu */
document.addEventListener('click', e => {
  if (!e.target.closest('#tagMenu')) $('tagMenu').hidden = true;
});

/* Esc fecha menu de tags e post-it */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePopups();
});

/* ---- Copiar e exportar ---- */

/* Copiar o texto do dia para a area de transferencia */
$('copy').onclick = () => {
  const t = dayText(cur);
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(() => alert('Copiado!'))
    .catch(() => {
      /* Plano B para quando o navegador bloqueia a copia direta */
      const x = document.createElement('textarea');
      x.value = t;
      document.body.appendChild(x);
      x.select();
      document.execCommand('copy');
      x.remove();
      alert('Copiado!');
    });
};

/* Nomes dos arquivos baixados: altere o primeiro argumento de download() */
$('expTxt').onclick    = () => download('atividades_' + cur + '.txt', dayText(cur), 'text/plain');
$('expCsv').onclick    = () => download('atividades_' + cur + '.csv', csvFor([cur]), 'text/csv');
$('expCsvAll').onclick = () => download('atividades_todas.csv', csvFor(Object.keys(db.days).sort()), 'text/csv');

/* ---- Tags: criar ---- */
function addTag() {
  const n = $('tagName').value.trim();
  if (!n) return;
  if (db.tags.some(t => t.name.toLowerCase() === n.toLowerCase())) {
    alert('Tag ja existe.');
    return;
  }
  db.tags.push({ id: uid(), name: n, color: $('tagColor').value });
  $('tagName').value = '';
  save();
  render();
}
$('tagAdd').onclick = addTag;
$('tagName').onkeydown = e => { if (e.key === 'Enter') addTag(); };   /* Enter tambem cria */

/* ---- Bloco extra (hora fora do expediente) ---- */
$('extraAdd').onclick = () => {
  const v = $('extraSel').value;
  if (v === '') return;
  const d = day(cur, true);
  d.extra = d.extra || [];
  d.extra.push(+v);
  save();
  render();
};

/* ---- Expediente (inicio e fim) ---- */
function setRange() {
  const s = parseInt($('startH').value);
  const e = parseInt($('endH').value);
  if (isNaN(s) || isNaN(e) || s < 0 || s > 23 || e < 1 || e > 24 || e <= s) {
    alert('Expediente invalido.');
    render();
    return;
  }
  db.start = s;
  db.end = e;
  save();
  render();
}
$('startH').onchange = setRange;
$('endH').onchange = setRange;

/* ---- Busca no historico (texto, nota ou nome de tag; ate 100 resultados) ---- */
$('search').oninput = () => {
  const q = $('search').value.trim().toLowerCase();
  const box = $('results');
  box.innerHTML = '';
  if (!q) return;

  let n = 0;
  Object.keys(db.days).sort().reverse().forEach(d => {
    const dd = db.days[d];
    Object.keys(dd.hours).sort((a, b) => a - b).forEach(h => {
      dd.hours[h].acts.forEach(a => {
        if (!isActFilled(a)) return;
        const tg = tagNames(a);
        const achou = (a.text || '').toLowerCase().includes(q) ||
                      (a.note || '').toLowerCase().includes(q) ||
                      tg.some(t => t.toLowerCase().includes(q));
        if (!achou) return;
        if (n++ >= 100) return;   /* limite de resultados: altere o 100 */

        const r = document.createElement('div');
        r.className = 'res';
        const [y, m, x] = d.split('-');
        r.innerHTML =
          '<b>' + x + '/' + m + '/' + y + ' ' + p2(h) + ':00</b> ' +
          (tg.length ? '<span class="muted">[' + esc(tg.join(', ')) + ']</span> ' : '') +
          esc((a.text || a.note || '').slice(0, 80));
        r.onclick = () => { cur = d; render(); window.scrollTo(0, 0); };
        box.appendChild(r);
      });
    });
  });
  if (!n) box.innerHTML = '<span class="muted">Nada encontrado.</span>';
};

/* ---- Backup e importacao ---- */
$('bkp').onclick = () =>
  download('backup_bloco_atividades_' + todayStr() + '.json', JSON.stringify(db, null, 1), 'application/json');

$('rst').onclick = () => $('file').click();


/* =====================================================================
   8. IMPORTACAO (JSON, CSV, TXT)
   .json  -> SUBSTITUI todos os dados pelo backup.
   .csv / .txt -> MESCLA: adiciona as atividades do arquivo aos dados atuais.
                  Se ja existir uma hora no mesmo dia, ela e SUBSTITUIDA
                  pelas atividades do arquivo (as demais horas sao mantidas).
                  Tags novas sao criadas automaticamente pelo nome.
   ===================================================================== */

$('file').onchange = () => {
  const f = $('file').files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const text = decodeBuffer(r.result);
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'json') importJson(text);
      else if (ext === 'csv') applyEntries(parseCsvEntries(text), f.name);
      else if (ext === 'txt') applyEntries(parseTxtEntries(text), f.name);
      else alert('Formato nao suportado. Use .json, .csv ou .txt.');
    } catch (e) {
      alert('Arquivo invalido ou fora do formato esperado.');
    }
  };
  r.readAsArrayBuffer(f);
  $('file').value = '';
};

/* Le o arquivo como UTF-8. Se falhar (ex.: CSV salvo pelo Excel em ANSI),
   tenta Windows-1252, que preserva acentos. */
function decodeBuffer(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\ufeff/, '');
  } catch (e) {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/* Importa backup .json (substitui tudo). Backups antigos sao convertidos. */
function importJson(text) {
  const d = JSON.parse(text);
  if (!d.days || !d.tags) throw 0;
  if (!confirm('Isso substitui TODOS os dados atuais pelo backup. Continuar?')) return;
  db = migrate(d);
  save();
  render();
}

/* Quebra um texto CSV em linhas e colunas (respeita aspas e "" dentro de aspas).
   Exemplo: parseCsv('a;"b;c"', ';') devolve [['a', 'b;c']] */
function parseCsv(t, sep) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

/* Converte data 'DD/MM/AAAA' (ou 'AAAA-MM-DD') em 'AAAA-MM-DD'. Devolve null se invalida. */
function normDate(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  return null;
}

/* Le o CSV exportado pelo programa.
   Colunas: Data;Inicio;Fim;Tags;Atividade;Nota   (aceita ';' ou ',' como separador)
   A coluna Nota e opcional (CSVs antigos nao tem).
   Devolve uma lista, uma entrada por atividade:
     [{ date:'2026-11-24', h:7, text:'...', tags:['Reuniao'], note:'...' }] */
function parseCsvEntries(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const sep = first.includes(';') ? ';' : ',';
  const out = [];
  parseCsv(text, sep).forEach((r, i) => {
    if (i === 0 && /^data$/i.test(r[0].trim())) return;   /* pula o cabecalho */
    const date = normDate(r[0] || '');
    const h = parseInt(r[1]);
    if (!date || isNaN(h) || h < 0 || h > 23) return;
    out.push({
      date: date,
      h: h,
      text: (r[4] || '').trim(),
      tags: (r[3] || '').split(',').map(s => s.trim()).filter(Boolean),
      note: (r[5] || '').trim()
    });
  });
  return out;
}

/* Le o TXT exportado pelo programa (formato descrito em dayText).
   Tambem le o formato antigo (uma atividade por hora, tags na linha do horario).
   Se a data do titulo nao for reconhecida, o programa pergunta qual usar. */
function parseTxtEntries(text) {
  const meses = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
                 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const out = [];
  let date = null, blk = null, act = null, inNote = false;

  const splitTags = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);

  /* Fecha a atividade em andamento e guarda se tiver conteudo */
  function fechar() {
    if (act) {
      act.text = act.text.trim();
      act.note = act.note.trim();
      if (act.text || act.note || act.tags.length) out.push(act);
    }
    act = null;
    inNote = false;
  }

  text.split(/\r?\n/).forEach(line => {
    /* Linha de titulo com a data */
    if (/^Registro de atividades/i.test(line)) {
      fechar();
      blk = null;
      const sem = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const m = sem.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
      const mi = m ? meses.indexOf(m[2]) : -1;
      date = (m && mi >= 0) ? m[3] + '-' + p2(mi + 1) + '-' + p2(m[1]) : null;
      return;
    }

    /* Linha de horario: "07:00 - 08:00" (formato antigo: "07:00 - 08:00  [tags]") */
    const hm = line.match(/^(\d{1,2}):00\s*[-\u2013\u2014]\s*\d{1,2}:00(?:\s+\[(.*)\])?\s*$/);
    if (hm) {
      fechar();
      if (!date) {
        const ask = prompt('Data nao encontrada no arquivo. Informe a data (DD/MM/AAAA):', cur.split('-').reverse().join('/'));
        date = normDate(ask || '');
        if (!date) throw 0;
      }
      blk = { h: parseInt(hm[1]), tags: splitTags(hm[2]) };
      return;
    }

    if (!blk) return;

    /* Cabecalho de atividade (2 espacos de recuo): "  Atividade 1 [tags]" */
    const am = line.match(/^ {2}Atividade \d+(?:\s+\[(.*)\])?\s*$/);
    if (am) {
      fechar();
      act = { date: date, h: blk.h, text: '', tags: splitTags(am[1]), note: '', v2: true };
      return;
    }

    /* Texto solto sem cabecalho de atividade = formato antigo */
    if (!act) {
      if (!line.trim()) return;
      act = { date: date, h: blk.h, text: '', tags: blk.tags, note: '', v2: false };
    }

    /* Linha de nota: "    Nota: ..." (so no formato novo) */
    const nm = act.v2 && !inNote ? line.match(/^ {4}Nota:\s?(.*)$/) : null;
    if (nm) {
      inNote = true;
      act.note += nm[1] + '\n';
      return;
    }

    const conteudo = act.v2 ? line.replace(/^ {1,4}/, '') : line;
    if (inNote) act.note += conteudo + '\n';
    else act.text += conteudo + '\n';
  });
  fechar();
  return out;
}

/* Aplica ao banco as atividades lidas de um CSV ou TXT (mescla com os dados atuais) */
function applyEntries(entries, fileName) {
  if (!entries.length) {
    alert('Nenhum registro encontrado em ' + fileName + '. Use arquivos exportados por este programa.');
    return;
  }
  if (!confirm('Importar ' + entries.length + ' atividade(s) de ' + fileName + '?\n' +
               'Horas que existirem no arquivo substituem as mesmas horas do mesmo dia; os demais dados sao mantidos.')) return;

  const cores = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];

  /* Procura a tag pelo nome (sem diferenciar maiuscula); cria se nao existir */
  function tagIdByName(nome) {
    let t = db.tags.find(x => x.name.toLowerCase() === nome.toLowerCase());
    if (!t) {
      t = { id: uid(), name: nome, color: cores[db.tags.length % cores.length] };
      db.tags.push(t);
    }
    return t.id;
  }

  /* Agrupa as atividades por dia e hora */
  const grupos = {};
  entries.forEach(e => {
    const k = e.date + '|' + e.h;
    if (!grupos[k]) grupos[k] = { date: e.date, h: e.h, acts: [] };
    grupos[k].acts.push({ text: e.text, tags: e.tags.map(tagIdByName), note: e.note || '' });
  });

  /* Cada grupo substitui o bloco da hora correspondente */
  Object.values(grupos).forEach(g => {
    day(g.date, true).hours[g.h] = { acts: g.acts };
  });

  save();
  render();
  alert('Importacao concluida: ' + entries.length + ' atividade(s).');
}


/* =====================================================================
   9. INICIO
   Desenha a tela pela primeira vez ao abrir a pagina.
   ===================================================================== */
render();
