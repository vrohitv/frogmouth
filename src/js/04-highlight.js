import { esc } from './00-util.js';

/* ── syntax highlighting: one small tokenizer, many languages ───── */
export const HL = (() => {
  const W = (s) => new Set(s.split(' '));
  const C_LIKE = 'if else for while do switch case default break continue return goto try catch finally throw new delete typeof instanceof in of void';
  const L = {
    js: { kw: W(C_LIKE + ' var let const function class extends super this import export from as async await yield static get set interface type enum implements namespace declare readonly public private protected abstract keyof satisfies'),
      lit: W('true false null undefined NaN Infinity'), bi: W('console window document Math JSON Object Array String Number Boolean Promise Map Set Date RegExp Error Symbol fetch require module process'),
      lc: ['//'], bc: [['/*', '*/']], str: '"\'', tpl: true, re: true },
    py: { kw: W('def class return if elif else for while in not and or is import from as with try except finally raise pass break continue lambda yield global nonlocal assert del async await match case'),
      lit: W('True False None'), bi: W('print len range dict list set tuple str int float bool open super self cls isinstance enumerate zip map filter sorted any all min max sum'),
      lc: ['#'], str: '"\'', triple: true, deco: true },
    go: { kw: W('func package import var const type struct interface map chan go defer select return if else for range switch case default break continue fallthrough goto'),
      lit: W('true false nil iota'), bi: W('make new len cap append copy panic recover print println error string int int64 int32 uint byte rune float64 bool any'), lc: ['//'], bc: [['/*', '*/']], str: '"\'', raw: '`' },
    rs: { kw: W('fn let mut const static struct enum impl trait pub use mod crate super self Self where for in loop while if else match return break continue as ref move async await dyn unsafe extern type'),
      lit: W('true false None Some Ok Err'), bi: W('String Vec Option Result Box println format vec panic i32 i64 u8 u32 u64 usize f32 f64 bool str'), lc: ['//'], bc: [['/*', '*/']], str: '"', macro: true },
    c: { kw: W(C_LIKE + ' int long short char float double unsigned signed struct union enum typedef static const extern sizeof void auto register volatile inline class public private protected virtual template typename namespace using operator friend final override package import extends implements interface abstract synchronized throws val var fun object when is lateinit func let guard protocol extension'),
      lit: W('true false null NULL nullptr nil this self'), bi: W('printf std System String Integer cout cin endl'), lc: ['//'], bc: [['/*', '*/']], str: '"\'', pre: true },
    sh: { kw: W('if then else elif fi for while until do done case esac in function return export local readonly unset shift source alias exit set'),
      lit: W('true false'), bi: W('echo cd ls cat grep sed awk find xargs curl git npm npx node python pip docker kubectl make sudo chmod chown mkdir rm cp mv touch printf read test tar ssh scp brew yarn pnpm go cargo'),
      lc: ['#'], str: '"\'', vars: true },
    sql: { kw: W('select from where and or not insert into values update set delete create table index view drop alter add column primary key foreign references join left right inner outer full on group by order having limit offset as distinct union all case when then else end exists in is like between returning with default constraint unique if begin commit rollback grant'),
      lit: W('null true false'), bi: W('count sum avg min max coalesce now lower upper cast'), lc: ['--'], bc: [['/*', '*/']], str: '\'"', ci: true },
    json: { kw: W(''), lit: W('true false null'), str: '"', keys: true },
    yaml: { kw: W(''), lit: W('true false null yes no on off ~'), lc: ['#'], str: '"\'', yamlKeys: true },
    css: { kw: W('@media @import @keyframes @font-face @supports @layer !important'), lit: W(''), bc: [['/*', '*/']], lc: ['//'], str: '"\'', css: true },
    rb: { kw: W('def end class module if elsif else unless while until for in do return yield begin rescue ensure raise then case when require include extend attr_accessor self super lambda proc'),
      lit: W('true false nil'), bi: W('puts print p'), lc: ['#'], str: '"\'', vars: false, sym: true },
    php: { kw: W(C_LIKE + ' function class public private protected static echo use namespace extends implements interface trait abstract final const array fn match readonly'), lit: W('true false null'), bi: W(''), lc: ['//', '#'], bc: [['/*', '*/']], str: '"\'', vars: true },
  };
  const ALIAS = {
    javascript: 'js', jsx: 'js', ts: 'js', tsx: 'js', typescript: 'js', mjs: 'js', cjs: 'js', node: 'js',
    python: 'py', py3: 'py', golang: 'go', rust: 'rs', bash: 'sh', zsh: 'sh', shell: 'sh', console: 'sh', fish: 'sh', dockerfile: 'sh', docker: 'sh', makefile: 'sh', env: 'sh', ini: 'sh', toml: 'yaml',
    yml: 'yaml', scss: 'css', less: 'css', postgres: 'sql', mysql: 'sql', sqlite: 'sql', psql: 'sql',
    cpp: 'c', 'c++': 'c', h: 'c', hpp: 'c', cs: 'c', csharp: 'c', java: 'c', kotlin: 'c', kt: 'c', swift: 'c', scala: 'c', dart: 'c', zig: 'c',
    ruby: 'rb', html: 'html', xml: 'html', svg: 'html', vue: 'html', svelte: 'html', diff: 'diff', patch: 'diff',
  };
  const LANGS = ['js', 'ts', 'py', 'go', 'rs', 'c', 'cpp', 'java', 'sh', 'sql', 'json', 'yaml', 'css', 'html', 'rb', 'php', 'diff', 'text'];
  const norm = (l) => { l = (l || '').toLowerCase().trim(); return L[l] || l === 'html' || l === 'diff' || l === 'text' ? l : ALIAS[l] || ''; };

  function detect(t) {
    const s = t.trim();
    if (!s) return 'text';
    if (/^[[{]/.test(s)) { try { JSON.parse(s); return 'json'; } catch {} }
    if (/^<(!doctype|[a-z][\w-]*)[\s>]/i.test(s)) return 'html';
    if (/^(diff --git|---\s|\+\+\+\s|@@\s)/m.test(s)) return 'diff';
    if (/^\s*(select|insert|update|delete|create|alter|with)\s/i.test(s)) return 'sql';
    if (/^#!|^\s*(\$ |sudo |npm |git |cd |export |brew |docker |kubectl |curl )/m.test(s)) return 'sh';
    if (/^\s*(def |class \w+(\(.*\))?:|import \w+$|from \S+ import)|:\s*\n\s{2,}\w/m.test(s) && !/[{};]\s*$/m.test(s)) return 'py';
    if (/^\s*(package \w+|func \w*\()|:= /m.test(s)) return 'go';
    if (/\bfn \w+|let mut |impl\b|::\w+|println!/.test(s)) return 'rs';
    if (/^\s*#include|std::|public static void|System\.out/m.test(s)) return 'c';
    if (/^\s*[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[^}]*:[^}]*;/m.test(s)) return 'css';
    if (/^\s*[\w-]+:(\s|$)/m.test(s) && !/[;{}()]/.test(s)) return 'yaml';
    if (/\b(const|let|var|function|=>|import .* from|export )\b/.test(s)) return 'js';
    return 'js';
  }

  const span = (c, t) => `<span class="t-${c}">${esc(t)}</span>`;
  const isId = (c) => /[A-Za-z0-9_$]/.test(c);

  function code(src, d) {
    let out = '', i = 0, prev = '';
    const n = src.length;
    const at = (s) => src.startsWith(s, i);
    while (i < n) {
      const ch = src[i];
      // block comments
      let hit = false;
      if (d.bc) for (const [a, b] of d.bc) {
        if (at(a)) { let e = src.indexOf(b, i + a.length); e = e < 0 ? n : e + b.length; out += span('c', src.slice(i, e)); i = e; hit = true; break; }
      }
      if (hit) continue;
      if (d.lc) for (const c of d.lc) {
        if (at(c) && !(c === '#' && d.css)) { let e = src.indexOf('\n', i); e = e < 0 ? n : e; out += span('c', src.slice(i, e)); i = e; hit = true; break; }
      }
      if (hit) continue;
      // strings
      if (d.triple && (at('"""') || at("'''"))) {
        const q = src.substr(i, 3); let e = src.indexOf(q, i + 3); e = e < 0 ? n : e + 3;
        out += span('s', src.slice(i, e)); i = e; continue;
      }
      if ((d.str && d.str.includes(ch)) || (d.tpl && ch === '`') || (d.raw && ch === d.raw)) {
        let e = i + 1;
        const multi = ch === '`';
        while (e < n && src[e] !== ch) {
          if (src[e] === '\\' && !(d.raw && ch === d.raw)) e++;
          else if (src[e] === '\n' && !multi) break;
          e++;
        }
        e = Math.min(n, e + 1);
        const s = src.slice(i, e);
        const isKey = (d.keys || d.yamlKeys) && /^\s*:/.test(src.slice(e, e + 20));
        out += span(isKey ? 'p' : 's', s); i = e; prev = 's'; continue;
      }
      // numbers
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        if (!isId(src[i - 1] || ' ')) {
          const m = /^(0x[\da-f_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*\.?\d*(e[+-]?\d+)?|\.\d+)(n|[a-z%]+)?/i.exec(src.slice(i, i + 40));
          if (m) { out += span('n', m[0]); i += m[0].length; prev = 'n'; continue; }
        }
      }
      // shell / php variables
      if (d.vars && ch === '$') {
        const m = /^\$(\{[^}]*\}|[A-Za-z_]\w*|[0-9@#?*!$-])/.exec(src.slice(i, i + 60));
        if (m) { out += span('v', m[0]); i += m[0].length; continue; }
      }
      // decorators / annotations / ruby symbols
      if ((d.deco || d.pre || d === L.js) && ch === '@' && /[A-Za-z_]/.test(src[i + 1] || '')) {
        const m = /^@[\w.]+/.exec(src.slice(i, i + 60)); out += span('b', m[0]); i += m[0].length; continue;
      }
      if (d.sym && ch === ':' && /[A-Za-z_]/.test(src[i + 1] || '') && src[i - 1] !== ':') {
        const m = /^:\w+/.exec(src.slice(i, i + 60)); out += span('l', m[0]); i += m[0].length; continue;
      }
      if (d.pre && ch === '#' && /^\s*$/.test(src.slice(src.lastIndexOf('\n', i - 1) + 1, i))) {
        let e = src.indexOf('\n', i); e = e < 0 ? n : e; out += span('b', src.slice(i, e)); i = e; continue;
      }
      if (d.css && (ch === '#' || ch === '.') && /[\w-]/.test(src[i + 1] || '')) {
        const m = /^[#.][\w-]+/.exec(src.slice(i, i + 60));
        const inBlock = src.lastIndexOf('{', i) > src.lastIndexOf('}', i);
        out += span(inBlock && ch === '#' ? 'n' : 't', m[0]); i += m[0].length; continue;
      }
      // identifiers
      if (/[A-Za-z_$@!-]/.test(ch) && (isId(ch) || (d.css && ch === '-') || (d.css && ch === '@') || (d === L.css && ch === '!'))) {
        const m = (d.css ? /^[@!]?[\w-]+/ : /^[A-Za-z_$][\w$]*/).exec(src.slice(i, i + 200));
        if (m) {
          const w = m[0], lw = d.ci ? w.toLowerCase() : w;
          const after = src.slice(i + w.length, i + w.length + 40);
          let c = '';
          if (d.kw.has(lw)) c = 'k';
          else if (d.lit.has(lw)) c = 'l';
          else if (d.css) { if (/^\s*:(?!:)/.test(after) && src.lastIndexOf('{', i) > src.lastIndexOf('}', i)) c = 'p'; else if (src.lastIndexOf('{', i) <= src.lastIndexOf('}', i)) c = 't'; }
          else if (d.yamlKeys && /^\s*:(\s|$)/.test(after) && /^\s*(- )?$/.test(src.slice(src.lastIndexOf('\n', i - 1) + 1, i))) c = 'p';
          else if (d.macro && after[0] === '!') c = 'f';
          else if (/^\s*\(/.test(after) && prev !== '.') c = d.bi && d.bi.has(lw) ? 'b' : 'f';
          else if (/^\s*\(/.test(after)) c = 'f';
          else if (d.bi && d.bi.has(lw)) c = 'b';
          else if (/^[A-Z][a-z0-9]+[A-Z]?\w*$/.test(w) && !d.ci) c = 't';
          else if (prev === '.' && d !== L.sh) c = 'm';
          out += c ? span(c, w) : esc(w);
          i += w.length; prev = 'w'; continue;
        }
      }
      // regex literal (js), only where an expression can start
      if (d.re && ch === '/' && /[(,=:[!&|?{};]\s*$|return\s*$|^\s*$/.test(src.slice(Math.max(0, i - 12), i))) {
        const m = /^\/(?![*/])(\\.|\[(\\.|[^\]\n])*\]|[^/\\\n[])+\/[a-z]*/.exec(src.slice(i, i + 300));
        if (m) { out += span('r', m[0]); i += m[0].length; continue; }
      }
      prev = ch === '.' ? '.' : /\s/.test(ch) ? prev : ch;
      out += esc(ch);
      i++;
    }
    return out;
  }

  function markup(src) {
    return src.replace(/(<!--[\s\S]*?(?:-->|$))|(<\/?)([\w:-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?>)?|([^<]+)|(<)/g,
      (m, com, open, tag, attrs, close, text, lt) => {
        if (com) return span('c', com);
        if (text != null) return esc(text);
        if (lt) return esc(lt);
        const a = (attrs || '').replace(/(\s+)([^\s=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g,
          (_, sp, name, eq, val) => esc(sp) + span('p', name) + (eq ? esc(eq) + span('s', val) : ''));
        return esc(open) + span('k', tag) + a + (close ? esc(close) : '');
      });
  }

  function diff(src) {
    return src.split('\n').map((l) => {
      const c = /^(\+\+\+|---)/.test(l) ? 'k' : l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : l.startsWith('@@') ? 'f' : '';
      return c ? span(c, l) : esc(l);
    }).join('\n');
  }

  function highlight(src, lang) {
    let l = norm(lang);
    if (!l) l = detect(src);
    if (src.length > 200000) return esc(src);
    if (l === 'text') return esc(src);
    if (l === 'html') return markup(src);
    if (l === 'diff') return diff(src);
    return code(src, L[l] || L.js);
  }

  return { highlight, detect, LANGS };
})();
