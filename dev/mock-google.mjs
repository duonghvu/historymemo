// Runs the REAL apps-script/*.gs code in Node with Google's services simulated on your disk.
// Drive folders become real folders under ./local-data/drive, so you can see how storage is organised.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

export function createMockGoogle(projectDir, dataDir) {
  const driveDir = path.join(dataDir, 'drive');
  fs.mkdirSync(driveDir, { recursive: true });
  const propsFile = path.join(dataDir, 'props.json');
  const regFile = path.join(dataDir, 'drive.json');
  const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
  const props = load(propsFile, {});
  const reg = load(regFile, {});              // id → { kind, name, parent, mime }
  const saveProps = () => fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));
  const saveReg = () => fs.writeFileSync(regFile, JSON.stringify(reg, null, 2));
  const tz = process.env.TZ_DEFAULT || 'Asia/Ho_Chi_Minh';
  const triggers = [];                        // names of pending one-off trigger functions

  const pathOf = id => {
    const parts = [];
    for (let cur = id; cur && reg[cur]; cur = reg[cur].parent) parts.unshift(reg[cur].name);
    return path.join(driveDir, ...parts);
  };
  const newId = () => crypto.randomBytes(8).toString('hex');

  function addItem(kind, name, parent, mime) {
    const id = newId();
    reg[id] = { kind, name: name.replace(/[\/\\]/g, '-'), parent: parent || null, mime };
    saveReg();
    if (kind === 'folder') fs.mkdirSync(pathOf(id), { recursive: true });
    return id;
  }

  const folderObj = id => ({
    getId: () => id,
    getName: () => reg[id].name,
    getUrl: () => `/__drive/${id}`,
    createFolder: name => folderObj(addItem('folder', name, id)),
    getFoldersByName: name => {
      const hits = Object.keys(reg).filter(k => reg[k].parent === id && reg[k].kind === 'folder' && reg[k].name === name);
      return { hasNext: () => hits.length > 0, next: () => folderObj(hits.shift()) };
    },
    setTrashed: () => { fs.rmSync(pathOf(id), { recursive: true, force: true }); delete reg[id]; saveReg(); },
    addViewer: email => console.log(`  [mock] share folder "${reg[id].name}" with ${email} (view)`),
    getFilesByName: name => {
      const hits = Object.keys(reg).filter(k => reg[k].parent === id && reg[k].kind !== 'folder' && reg[k].name === name);
      return { hasNext: () => hits.length > 0, next: () => fileObj(hits.shift()) };
    },
    createFile: (name, content, mime) => {
      const fid = addItem('file', name, id, mime || 'text/plain');
      fs.writeFileSync(pathOf(fid), content);
      return fileObj(fid);
    },
  });

  const fileObj = id => ({
    getId: () => id,
    getName: () => reg[id].name,
    getUrl: () => `/__drive/${id}`,
    moveTo: folder => {
      const from = pathOf(id);
      reg[id].parent = folder.getId(); saveReg();
      fs.renameSync(from, pathOf(id));
    },
    getBlob: () => ({ getContentType: () => reg[id].mime || 'application/octet-stream', getBytes: () => fs.readFileSync(pathOf(id)),
                      getDataAsString: () => fs.readFileSync(pathOf(id), 'utf8') }),
    setContent: s => fs.writeFileSync(pathOf(id), s),
    addEditor: email => console.log(`  [mock] share "${reg[id].name}" with ${email} (edit)`),
    getSize: () => (fs.existsSync(pathOf(id)) ? fs.statSync(pathOf(id)).size : 0),
    isTrashed: () => false,
    setTrashed: () => { try { fs.unlinkSync(pathOf(id)); } catch {} delete reg[id]; saveReg(); },
  });

  // Very small Google Docs stand-in: a Markdown file.
  const docObj = id => {
    const lines = fs.existsSync(pathOf(id)) ? fs.readFileSync(pathOf(id), 'utf8').split('\n') : [];
    const para = (prefix, text) => {
      const p = { text, prefix, link: null, italic: false };
      lines.push(null); const idx = lines.length - 1;
      const write = () => {
        let t = p.italic ? `_${p.text}_` : p.text;
        if (p.link) t = `[${t}](${p.link})`;
        lines[idx] = (p.prefix ? p.prefix + ' ' : '') + t;
      };
      write();
      const api = {
        setHeading: h => { p.prefix = h; write(); return api; },
        setItalic: v => { p.italic = v; write(); return api; },
        setLinkUrl: u => { p.link = u; write(); return api; },
      };
      return api;
    };
    return {
      getId: () => id,
      getBody: () => ({ appendParagraph: t => para('', t), appendListItem: t => para('-', t) }),
      saveAndClose: () => fs.writeFileSync(pathOf(id), lines.join('\n') + '\n'),
    };
  };

  // Small Google Sheets stand-in: a JSON file {tabName: [[row], …]} (open /__drive/<id> to see it as tables).
  const sheetFile = id => {
    const read = () => JSON.parse(fs.readFileSync(pathOf(id), 'utf8'));
    const write = d => fs.writeFileSync(pathOf(id), JSON.stringify(d, null, 1));
    const tab = name => {
      let cur = name;
      const rows = () => read()[cur];
      const setRows = r => { const d = read(); d[cur] = r; write(d); };
      const width = r => Math.max(1, ...r.map(x => x.length));
      const range = (row, col, nr = 1, nc = 1) => ({
        getValues: () => { const r = rows(); return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((r[row - 1 + i] || [])[col - 1 + j] ?? ''))); },
        setValues: v => { const r = rows(); v.forEach((vr, i) => { const t = (r[row - 1 + i] = r[row - 1 + i] || []); vr.forEach((x, j) => { while (t.length < col - 1 + j) t.push(''); t[col - 1 + j] = x; }); }); setRows(r); },
        setValue: x => range(row, col).setValues([[x]]),
      });
      const api = {
        getName: () => cur,
        setName: n => { const d = read(); d[n] = d[cur]; delete d[cur]; write(d); cur = n; return api; },
        getRange: range,
        getDataRange: () => { const r = rows(); return r.length ? range(1, 1, r.length, width(r)) : { getValues: () => [['']] }; },
        appendRow: v => { const r = rows(); r.push(v); setRows(r); return api; },
        clearContents: () => { setRows([]); return api; },
        setFrozenRows: () => api,
      };
      return api;
    };
    return {
      getId: () => id,
      getUrl: () => `/__drive/${id}`,
      getSheets: () => Object.keys(read()).map(tab),
      getSheetByName: n => (n in read() ? tab(n) : null),
      insertSheet: n => { const d = read(); d[n] = []; write(d); return tab(n); },
    };
  };

  const pad = n => String(n).padStart(2, '0');
  function formatDate(date, zone, pattern) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: zone || tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(p => [p.type, p.value]));
    return pattern.replace(/yyyy|MM|dd|HH|mm|H/g, tok => ({
      yyyy: parts.year, MM: parts.month, dd: parts.day, HH: pad(Number(parts.hour)), mm: parts.minute, H: String(Number(parts.hour)),
    })[tok]);
  }

  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); saveProps(); },
      setProperties: o => { Object.assign(props, o); saveProps(); },
      deleteProperty: k => { delete props[k]; saveProps(); },
    }) },
    DriveApp: {
      createFolder: name => folderObj(addItem('folder', name, null)),
      getFolderById: id => { if (!reg[id]) throw new Error('No folder ' + id); return folderObj(id); },
      getFileById: id => { if (!reg[id]) throw new Error('No file ' + id); return fileObj(id); },
      getRootFolder: () => ({}),
    },
    DocumentApp: {
      ParagraphHeading: { TITLE: '#', HEADING1: '##', HEADING2: '###', HEADING3: '####' },
      create: name => { const id = addItem('doc', name + '.md', null, 'text/markdown'); fs.writeFileSync(pathOf(id), ''); return docObj(id); },
      openById: id => docObj(id),
    },
    Utilities: {
      formatDate,
      getUuid: () => crypto.randomUUID(),
      base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    },
    SpreadsheetApp: {
      create: name => { const id = addItem('sheet', name + '.sheet.json', null, 'application/json'); fs.writeFileSync(pathOf(id), '{"Sheet1":[]}'); return sheetFile(id); },
      openById: id => { if (!reg[id]) throw new Error('No spreadsheet ' + id); return sheetFile(id); },
    },
    LanguageApp: { translate: (text, from, to) => `[${to}] ${text}` },
    Session: { getScriptTimeZone: () => tz },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    ScriptApp: {
      getOAuthToken: () => 'mock-token',
      getProjectTriggers: () => triggers.map(fn => ({ getHandlerFunction: () => fn })),
      deleteTrigger: t => { const i = triggers.indexOf(t.getHandlerFunction()); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: fn => ({ timeBased: () => ({
        everyHours: () => ({ create() {} }),
        // one-off trigger: in dev:mock, run it for real a little later (tests call afterStory() themselves)
        after: ms => ({ create() {
          triggers.push(fn);
          if (process.env.MOCK_TRIGGERS !== '0') setTimeout(() => { try { ctx[fn](); } catch (e) { console.error(e); } }, Math.min(ms, 5000)).unref();
        } }),
      }) }),
    },
    MailApp: { sendEmail: o => console.log(`  [mock] email to ${o.to}: ${o.subject}`) },
    UrlFetchApp: { fetch: (url, opts) => ({ getContentText: () => JSON.stringify(fakeFetch(url, opts)) }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }),
    },
    Logger: { log: m => console.log('  [gas] ' + m) },
  };
  // Stand-ins for the Claude API and speech-to-text so the whole journey works offline.
  function fakeFetch(url, opts) {
    if (url.includes('api.anthropic.com')) {
      const body = JSON.parse(opts.payload);
      const msg = body.messages[0].content;
      if (/memoir chapter/i.test(body.system)) {
        return { content: [{ type: 'text', text: '[Sample AI chapter: with an ANTHROPIC_API_KEY, Claude writes this chapter in the first person from the transcripts.]' }] };
      }
      const reply = o => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
      if (/tactical empathy/i.test(body.system)) {
        // Follow-up: "ask" unless the answer sounds closed.
        const answer = (msg.match(/Their answer[^:]*: ([\s\S]*?)\n\nDecide/) || [])[1] || '';
        if (/don't want|không muốn|nothing special/i.test(answer)) return reply({ ask: false, reason: 'they closed the topic' });
        return reply({ ask: true, technique: 'label', reason: 'sample',
          en: '[AI follow-up] It sounds like that time meant a lot to you. What do you remember most about it?',
          vi: '[AI hỏi thêm] Nghe như lúc đó rất có ý nghĩa với {x}. {X} nhớ nhất điều gì?',
          ja: '[AI フォローアップ] その頃はとても大切な時間だったようですね。一番覚えているのはどんなことですか？' });
      }
      if (/translate interview questions/i.test(body.system)) {
        const q = (msg.match(/"""([\s\S]*?)"""/) || [])[1] || '';
        const dup = /favou?rite game|thích chơi trò gì/i.test(q) ? '1' : '';
        return reply({ en: `[en] ${q}`, vi: `[vi] ${q}`, ja: `[ja] ${q}`, stage: 'child', duplicateOf: dup });
      }
      const stage = (msg.match(/about this life stage: ([^\n(:]+)/) || [])[1] || 'this time';
      const items = [1, 2, 3, 4].map(i => ({
        en: `[AI sample] ${stage.trim()}: question ${i}. What do you remember?`,
        vi: `[AI mẫu] ${stage.trim()}: câu ${i}. {X} còn nhớ gì không?`,
        ja: `[AI サンプル] ${stage.trim()}：質問${i}。何を覚えていますか？`,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(items) }] };
    }
    if (url.includes('api.openai.com')) return { text: '[Sample transcript: with an OPENAI_API_KEY, the real words appear here.]' };
    return { error: 'Notifications only work on the deployed HTTPS site' };
  }
  if (process.env.MOCK_AI !== '0') {
    props.ANTHROPIC_API_KEY = props.ANTHROPIC_API_KEY || 'mock';
    props.OPENAI_API_KEY = props.OPENAI_API_KEY || 'mock';
    saveProps();
  }

  vm.createContext(ctx);
  const src = ['Questions.gs', 'Code.gs'].map(f => fs.readFileSync(path.join(projectDir, 'apps-script', f), 'utf8')).join('\n');
  vm.runInContext(src, ctx, { filename: 'apps-script' });

  // CONFIG.SHARED_DRIVE_ID set → simulate that Shared Drive as a top-level folder with the same id.
  const sharedId = vm.runInContext('CONFIG.SHARED_DRIVE_ID', ctx);
  if (sharedId && !reg[sharedId]) {
    reg[sharedId] = { kind: 'folder', name: 'Shared drive', parent: null };
    saveReg();
    fs.mkdirSync(pathOf(sharedId), { recursive: true });
  }

  if (!props.SECRET) ctx.setup();

  return {
    secret: () => props.SECRET,
    call: body => JSON.parse(ctx.doPost({ postData: { contents: body } }).getContent()),
    hourly: () => ctx.hourly(),
    reg, pathOf, addItem, ctx,
  };
}
