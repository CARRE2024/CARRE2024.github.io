/* Logica.js - port a JavaScript (ES2019, sin dependencias) de Logica.kt.
 * Lee stocktotal.js, entiende la frase dicha y elige los mejores artículos.
 * API: Logica.parseCatalogo(jsText) y Logica.buscar(texto, cat).
 */
var Logica = (function () {
  'use strict';

  var MIN_UNITS = 3;
  var MAX_RESULTS = 3;
  var TV_SIN_STOCK_DESDE = 65;

  // ───────── Utilidades que imitan Kotlin/Java ─────────

  // \s de Java (solo ASCII)
  var S = '[ \\t\\n\\x0B\\f\\r]';
  // isWhitespace de Kotlin
  var KWS = '[\\t\\n\\x0B\\f\\r\\x1C-\\x1F \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]';
  var KTRIM = new RegExp('^' + KWS + '+|' + KWS + '+$', 'g');
  var KBLANK = new RegExp('^' + KWS + '*$');
  function ktrim(s) { return s.replace(KTRIM, ''); }
  function kblank(s) { return KBLANK.test(s); }

  function kInt(v) { // Double.toInt() saturante
    if (v !== v) return 0;
    if (v >= 2147483647) return 2147483647;
    if (v <= -2147483648) return -2147483648;
    return Math.trunc(v);
  }

  // Double.toString() de Kotlin/Java
  function kStr(v) {
    if (v !== v) return 'NaN';
    if (v === Infinity) return 'Infinity';
    if (v === -Infinity) return '-Infinity';
    if (v === 0) return (1 / v < 0) ? '-0.0' : '0.0';
    var a = Math.abs(v);
    if (a >= 1e-3 && a < 1e7) {
      var s = String(v);
      return s.indexOf('.') < 0 ? s + '.0' : s;
    }
    var e = v.toExponential(); // "1.5e+21"
    var p = e.split('e');
    var mant = p[0].indexOf('.') < 0 ? p[0] + '.0' : p[0];
    var ex = p[1].charAt(0) === '+' ? p[1].substring(1) : p[1];
    return mant + 'E' + ex;
  }

  var DBL_RX = /^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?))$/;
  function toDoubleOrNull(s) {
    if (!DBL_RX.test(s)) return null;
    var t = s.replace(/[fFdD]$/, '');
    if (/NaN$/.test(t)) return NaN;
    return Number(t);
  }
  function toIntOrNull(s) {
    if (!/^[+-]?\d+$/.test(s)) return null;
    var v = Number(s);
    if (v > 2147483647 || v < -2147483648) return null;
    return v;
  }

  // find con lookbehind emulado: okPrev(charAnterior) decide; rx debe ser global
  function findFrom(rx, s, start, okPrev) {
    rx.lastIndex = start;
    var m;
    while ((m = rx.exec(s)) !== null) {
      var prev = m.index === 0 ? '' : s.charAt(m.index - 1);
      if (!okPrev || okPrev(prev)) return m;
      rx.lastIndex = m.index + 1;
    }
    return null;
  }
  function findAll(rx, s, okPrev) {
    var out = [];
    var pos = 0;
    for (;;) {
      var m = findFrom(rx, s, pos, okPrev);
      if (!m) break;
      out.push(m);
      pos = m.index + (m[0].length || 1);
    }
    return out;
  }
  function g(x) { return x === undefined ? '' : x; }

  function newSet(arr) { return new Set(arr); }
  function mapOf(obj) { var m = new Map(); for (var k in obj) m.set(k, obj[k]); return m; }

  function setEq(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
    return true;
  }

  // ───────── Texto ─────────

  var Texto = (function () {
    var ACCENTS = /\p{M}+/gu;
    var DEC = /(\d)[.,](?=\d)/g;
    var SPLIT = /(\d)(?=[a-z])|([a-z])(?=\d)/g;
    var OTHER = /[^a-z0-9]+/g;
    var CANON = mapOf({
      blanca: 'blanco', blancas: 'blanco', blancos: 'blanco',
      negra: 'negro', negras: 'negro', negros: 'negro',
      inoxidable: 'inox', inoxidables: 'inox', acero: 'inox', aceros: 'inox', chollo: 'chollos', mled: 'miniled', minled: 'miniled'
    });

    function tokens(s) {
      var n = s.toLowerCase().normalize('NFD').replace(ACCENTS, '');
      n = n.replace(DEC, function (m, d) { return d + ' punto '; });
      n = n.replace(SPLIT, function (m, a, b) { return (a !== undefined ? a : b) + ' '; }).replace(OTHER, ' ');
      n = ktrim(n);
      if (n.length === 0) return [];
      var parts = n.split(' ');
      var raw = [];
      for (var q = 0; q < parts.length; q++) {
        if (parts[q].length === 0) continue;
        var c = CANON.get(parts[q]);
        raw.push(c !== undefined ? c : parts[q]);
      }
      var out = [];
      var i = 0;
      while (i < raw.length) {
        var t = raw[i];
        if (i + 1 < raw.length) {
          var nx = raw[i + 1];
          if (nx === 'k' && (t === '4' || t === '8')) { out.push(t + 'k'); i += 2; continue; }
          if (nx === 'g' && (t === '3' || t === '4' || t === '5')) { out.push(t + 'g'); i += 2; continue; }
          if (t === 'mini' && nx === 'led') { out.push('miniled'); i += 2; continue; }
        }
        out.push(t);
        i += 1;
      }
      return out;
    }
    return { tokens: tokens };
  })();

  // ───────── Lectura de stocktotal.js ─────────

  var Datos = (function () {
    var ACCENTS = /\p{M}+/gu;
    var NON_ALNUM = /[^A-Z0-9]+/;
    var WS = new RegExp(S + '+', 'g');

    function norm(s) { return s.toUpperCase().normalize('NFD').replace(ACCENTS, ''); }
    function toks(u) { return u.split(NON_ALNUM).filter(function (x) { return x.length > 0; }); }
    function num(s) { return Number(s.replace(/,/g, '.')); }
    function has(u, w) { return u.indexOf(w) >= 0; }

    function parse(js) {
      var mf = new RegExp('const' + S + '+fecha' + S + '*=' + S + '*"([^"]*)"').exec(js);
      var fecha = mf ? mf[1] : '';
      var mb = new RegExp('const' + S + '+data' + S + '*=' + S + '*`([\\s\\S]*)`').exec(js);
      if (!mb) return null;
      var rows = csv(mb[1]);
      var items = [];
      for (var r = 0; r < rows.length; r++) {
        var it = toItem(rows[r]);
        if (it !== null) items.push(it);
      }
      if (items.length === 0) return null;
      return makeCatalogo(fecha, items);
    }

    function makeCatalogo(fecha, items) {
      var vocab = new Set();
      var tvSizes = new Set();
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        it.words.forEach(function (w) { vocab.add(w); });
        if (it.cats.has('tv') && it.nums.has('in')) tvSizes.add(kInt(it.nums.get('in')));
      }
      return { fecha: fecha, items: items, vocab: vocab, tvSizes: tvSizes };
    }

    function csv(s) {
      var rows = [];
      var row = [];
      var f = '';
      var inQ = false;
      var atStart = true;
      var i = 0;
      while (i < s.length) {
        var c = s.charAt(i);
        if (inQ) {
          if (c === '"') {
            if (i + 1 < s.length && s.charAt(i + 1) === '"') { f += '"'; i += 1; }
            else inQ = false;
          } else f += c;
        } else if (c === '"' && atStart) {
          inQ = true;
          atStart = false;
        } else if (c === ';') {
          row.push(f); f = ''; atStart = true;
        } else if (c === '\n') {
          row.push(f); f = ''; atStart = true;
          rows.push(row); row = [];
        } else if (c !== '\r') {
          f += c; atStart = false;
        }
        i += 1;
      }
      if (f.length > 0 || row.length > 0) { row.push(f); rows.push(row); }
      return rows.filter(function (r) {
        return r.length >= 13 && r.some(function (c) { return !kblank(c); });
      });
    }

    function toItem(r) {
      var seccion = ktrim(r[2]);
      var grupo = ktrim(r[3]);
      var sub = ktrim(r[4]);
      var name = ktrim(r[5].split('T¿V').join('TV').split('¿').join(' ').replace(WS, ' '));
      var ean = ktrim(r[7]);
      var sup = ktrim(r[10]);
      var price = toDoubleOrNull(ktrim(r[11]).replace(/,/g, '.'));
      if (price === null) return null;
      var st = toIntOrNull(ktrim(r[12]));
      var stock = st === null ? 0 : st;
      var oferta = r.length > 13 ? ktrim(r[13]) : '';
      if (name.length === 0 || ean.length === 0 || !/^[0-9]+$/.test(ean) || price <= 0) return null;
      var m = /[\d.,]+/.exec(sup);
      if (!m) return null;
      var v = toDoubleOrNull(m[0].replace(/,/g, '.'));
      if (v === null) return null;
      var supEur = sup.indexOf('%') >= 0 ? price * v / 100.0 : v;
      var supPct = Math.round(supEur / price * 10000.0) / 100.0;

      var u = norm(name);
      var nSec = norm(seccion), nGrupo = norm(grupo), nSub = norm(sub);
      var cats = categorias(nSec, nGrupo, nSub, u);
      var nums = new Map();
      var brand = marca(u);
      var energy = '';
      if (cats.has('tv')) {
        var inch = pulgadas(u, nSub);
        if (inch > 0) nums.set('in', inch);
      }
      medidas(u, cats, nums);
      atributos(u, cats, nums);
      if (nSec === 'GRAN APARATO') energy = clase(u);

      var inches = nums.has('in') ? kInt(nums.get('in')) : 0;
      var minStock;
      if (cats.has('tv')) {
        minStock = (inches >= TV_SIN_STOCK_DESDE || (inches === 0 && has(nGrupo, 'GRAN PULGADA'))) ? 0 : MIN_UNITS;
      } else if (nSec === 'GRAN APARATO') {
        minStock = cats.has('placa') ? MIN_UNITS : 0;
      } else minStock = MIN_UNITS;

      return {
        seccion: seccion, grupo: grupo, sub: sub, name: name, sms: ktrim(r[6]), ean: ean,
        supText: sup, supPct: supPct, supEur: Math.round(supEur * 100.0) / 100.0,
        price: price, stock: stock, oferta: oferta, cats: cats, brand: brand, nums: nums,
        energy: energy, minStock: minStock,
        words: new Set(Texto.tokens(name)),
        offerKeys: offerKeys(oferta)
      };
    }

    function offerKeys(oferta) {
      var s = new Set();
      if (kblank(oferta)) return s;
      var u = norm(oferta);
      s.add('any');
      if (has(u, 'SUPER PRECIO')) s.add('superprecio');
      if (has(u, 'CHOLLO')) s.add('chollos');
      return s;
    }

    var AMER_FIRST = newSet(['SBS', 'AMERICANO', 'MULTI', 'MULTIDOOR', 'SIDE']);
    function americano(u) {
      var t = toks(u);
      return (t.length > 0 && AMER_FIRST.has(t[0])) ||
        t.indexOf('AMERICANO') >= 0 || t.indexOf('MULTIDOOR') >= 0 || has(u, 'MULTI DOOR') ||
        has(u, 'FRENCH DOOR') || has(u, 'SIDE BY SIDE');
    }

    function placaEnNombre(u) {
      return has(u, 'VITRO') || has(u, 'PLACA') || has(u, 'INDUCCI') || has(u, 'ENCIMERA');
    }

    function categorias(sec, gr, sub, u) {
      var s = new Set();
      var t = toks(u);
      if (gr.startsWith('TV')) s.add('tv');
      else if (has(gr, 'CONSOLA')) s.add('consola');
      else if (has(gr, 'TELEFONO') || has(gr, 'MOVIL')) s.add('movil');
      else if (has(gr, 'MICROORDENADOR') || has(gr, 'PORTATIL')) {
        s.add('portatil');
        if (has(u, 'CHROMEBOOK') || has(u, 'CHOMEBOOK')) s.add('chromebook');
        else if (has(u, 'MACBOOK') || t.indexOf('MBP') >= 0) s.add('mac');
        else s.add('windows');
      }
      else if (has(gr, 'IMPRESORA')) s.add('impresora');
      else if (has(gr, 'TABLET')) s.add('tablet');
      else if (has(gr, 'WEARABLE')) s.add('reloj');
      else if (has(gr, 'MONITOR')) s.add('monitor');
      else if (has(gr, 'COMBIS')) s.add(americano(u) ? 'americano' : 'combi');
      else if (has(gr, 'LAVADORAS')) s.add((has(u, 'LAVASECADORA') || has(sub, 'SECADORA')) ? 'lavasecadora' : 'lavadora');
      else if (has(gr, 'LAVAVAJILLAS') || has(gr, 'LAVADO ENCASTRABLE')) s.add('lavavajillas');
      else if (has(gr, 'HORNO')) {
        s.add('horno');
        if (placaEnNombre(u)) s.add('placa');
      }
      else if (has(gr, 'PLACA')) s.add('placa');
      else if (has(gr, 'SECADORA')) s.add('secadora');
      else if (has(gr, 'CONGELADOR')) s.add('congelador');
      else if (has(gr, 'FRIGORIFICO')) s.add('frigo');
      else if (has(gr, 'CAMPANA')) s.add('campana');
      else if (has(gr, 'AIRE')) s.add('aire');
      else if (has(gr, 'CAFETERA')) s.add('cafetera');
      else if (has(gr, 'VENTILADOR')) s.add('ventilador');
      else if (has(gr, 'ALTAVOC')) s.add('altavoz');
      else if (has(gr, 'SONIDO')) s.add(has(u, 'ALTAVOZ') ? 'altavoz' : 'barra');
      if (s.size === 0) categoriasPorNombre(u).forEach(function (x) { s.add(x); });
      if (s.size === 0) s.add('otros');
      return s;
    }

    function categoriasPorNombre(u) {
      var s = new Set();
      var t = toks(u);
      if ((t.length > 0 && t[0] === 'TV') || has(u, 'TELEVISOR')) s.add('tv');
      else if (has(u, 'CONSOLA')) s.add('consola');
      else if (has(u, 'LAVASECADORA')) s.add('lavasecadora');
      else if (has(u, 'LAVAVAJILLAS')) s.add('lavavajillas');
      else if (has(u, 'LAVADORA')) s.add('lavadora');
      else if (has(u, 'SECADORA')) s.add('secadora');
      else if (has(u, 'VITRO') || has(u, 'PLACA') || has(u, 'ENCIMERA')) s.add('placa');
      else if (has(u, 'HORNO')) s.add('horno');
      else if (has(u, 'CAMPANA')) s.add('campana');
      else if (has(u, 'CONGELADOR') || t.indexOf('ARCON') >= 0) s.add('congelador');
      else if (americano(u)) s.add('americano');
      else if (t.indexOf('COMBI') >= 0) s.add('combi');
      else if (has(u, 'FRIGORIFICO') || (t.length > 0 && t[0] === 'FRIGO')) s.add('frigo');
      else if (has(u, 'CAFETERA')) s.add('cafetera');
      else if (has(u, 'AIRE ACOND')) s.add('aire');
      else if (has(u, 'VENTILADOR')) s.add('ventilador');
      else if (has(u, 'BARRA') && has(u, 'SONIDO')) s.add('barra');
      else if (has(u, 'ALTAVOZ')) s.add('altavoz');
      else if (has(u, 'IMPRESORA')) s.add('impresora');
      else if (has(u, 'MONITOR')) s.add('monitor');
      else if (has(u, 'TABLET')) s.add('tablet');
      else if (has(u, 'SMARTWATCH') || has(u, 'RELOJ')) s.add('reloj');
      else if (has(u, 'PORTATIL')) {
        s.add('portatil');
        s.add(has(u, 'CHROMEBOOK') ? 'chromebook' : (has(u, 'MACBOOK') ? 'mac' : 'windows'));
      }
      else if (has(u, 'TELEFONO') || has(u, 'MOVIL') || has(u, 'SMARTPHONE')) s.add('movil');
      return s;
    }

    var MARCAS = newSet([
      'SAMSUNG', 'LG', 'HISENSE', 'TCL', 'VIVO', 'INFINITON', 'CANDY', 'MIDEA', 'BOSCH', 'BEKO', 'APPLE', 'HP',
      'BALAY', 'OPPO', 'ASUS', 'HAIER', 'INDESIT', 'CECOTEC', 'ACER', 'TOSHIBA', 'XIAOMI', 'LENOVO', 'TECNO',
      'PRIMUX', 'CANON', 'AMAZFIT', 'FRIGELUX', 'ASPES', 'SOLAC', 'MELITTA', 'DELONGHI', 'JBL', 'SONY', 'PHILIPS',
      'PANASONIC', 'MICROSOFT', 'NEWPOL', 'MOTOROLA', 'HONOR', 'REALME', 'HUAWEI', 'DYSON', 'SMEG', 'TEKA',
      'WHIRLPOOL', 'ELECTROLUX', 'SIEMENS', 'NEFF', 'GRUNDIG', 'NOKIA', 'ZTE', 'POCO', 'NESPRESSO', 'TAURUS',
      'ARISTON', 'FAGOR', 'CORBERO', 'ZANUSSI', 'BRAUN', 'OTSEIN', 'ORBEGOZO'
    ]);
    var ALIAS = mapOf({
      PS5: 'SONY', PLAYSTATION: 'SONY', XBOX: 'MICROSOFT', IPHONE: 'APPLE', MACBOOK: 'APPLE',
      MBP: 'APPLE', GALAXY: 'SAMSUNG', REDMI: 'XIAOMI', VICTUS: 'HP', OMEN: 'HP',
      OMNIBOOK: 'HP', VIVOBOOK: 'ASUS', ZENBOOK: 'ASUS', MEGABOOK: 'TECNO'
    });
    var LG_PEGADO = /^(?:LG(\d|WIFI).*)$/;

    function marca(u) {
      var t = toks(u);
      if (t.length >= 2 && t.indexOf('NEW') >= 0 && t.indexOf('POL') >= 0) return 'newpol';
      for (var i = 0; i < t.length; i++) {
        var w = t[i];
        var a = ALIAS.get(w);
        if (a !== undefined) return a.toLowerCase();
        if (MARCAS.has(w)) return w.toLowerCase();
        if (LG_PEGADO.test(w)) return 'lg';
        if (w.startsWith('BALAY') || w.startsWith('INFINITON')) return w.startsWith('BALAY') ? 'balay' : 'infiniton';
      }
      return '';
    }

    var SIZES = [100, 98, 86, 85, 82, 77, 75, 70, 65, 60, 58, 55, 50, 48, 43, 40, 32, 28, 24];
    var SIZE_RX = new RegExp('(' + SIZES.join('|') + ')(?!\\d)', 'g');
    var INCH_WORD = new RegExp('(\\d{2,3})' + S + '*PULGADAS', 'g');
    function notDigit(c) { return !/^\d$/.test(c); }

    function pulgadas(u, sub) {
      var m = findFrom(INCH_WORD, u, 0, notDigit);
      if (m) return parseInt(m[1], 10);
      m = findFrom(SIZE_RX, u, 0, notDigit);
      if (m) return parseInt(m[1], 10);
      m = findFrom(INCH_WORD, sub, 0, notDigit);
      if (m) return parseInt(m[1], 10);
      return 0;
    }

    var D = '(\\d{2,3}(?:[.,]\\d)?)';
    var DIM3 = new RegExp(D + S + '*(?:CM)?' + S + '*X' + S + '*' + D + S + '*(?:CM)?(?:' + S + '*X' + S + '*' + D + ')?');
    var DIM_PARTIDA = new RegExp(D + S + '*X' + S + '*\\d?(?!\\d)');
    var CM1 = new RegExp(D + S + '*CM\\b', 'g');
    function notDigDotComma(c) { return !/^[\d.,]$/.test(c); }

    function medidas(u, cats, out) {
      var fridge = ['combi', 'frigo', 'americano', 'congelador'].some(function (x) { return cats.has(x); });
      var hob = ['placa', 'horno', 'campana'].some(function (x) { return cats.has(x); });
      var al = 0.0, an = 0.0, fo = 0.0;
      var m = DIM3.exec(u);
      if (m) {
        al = num(m[1]);
        an = num(m[2]);
        if (g(m[3]).length > 0) fo = num(m[3]);
      } else {
        var p = DIM_PARTIDA.exec(u);
        if (p) {
          al = num(p[1]);
        } else {
          var c = findFrom(CM1, u, 0, notDigDotComma);
          if (c) {
            var v = num(c[1]);
            if (hob) an = v; else al = v;
          }
        }
      }
      if (hob) {
        if (m) { al = 0.0; an = 0.0; fo = 0.0; }
      }
      if (al !== 0.0 && !(al >= 30 && al <= 230)) al = 0.0;
      if (an !== 0.0 && !(an >= 30 && an <= 120)) an = 0.0;
      if (fridge || hob) {
        if (al > 0) out.set('al', al);
        if (an > 0) out.set('an', an);
        if (fo > 0) out.set('fo', fo);
      }
    }

    var KG = new RegExp('(\\d{1,2}(?:,\\d)?)(?:/(\\d{1,2}))?' + S + '*KG');
    var KG_MULTI = new RegExp('(\\d{1,2})\\+\\d\\+\\d' + S + '*K');
    var SERV = new RegExp('(\\d{1,2})' + S + '*SERV');
    var LITROS = new RegExp('(\\d{2,3})' + S + '*(?:LITROS?|L)(?![A-Z0-9])', 'g');
    function litrosPrev(c) { return !/^[\dA-Z.\-]$/.test(c); }
    var RPM = new RegExp('(\\d{3,4})' + S + '*R(?:PM)?\\b');
    var ZONAS = new RegExp('(\\d)' + S + '*(?:ZONAS|FUEGOS|FOCOS)');
    var FRIG = new RegExp('(\\d{3,4})' + S + '*FRIG');
    var PAR_MEM = new RegExp('(\\d+)' + S + '*(GB|G|TB)?' + S + '*[+/]' + S + '*(\\d+)' + S + '*(GB|G|TB)?', 'g');
    var RAM_1 = new RegExp('(\\d{1,2})' + S + '*G(?:B)?(?![A-Z0-9])', 'g');
    var ROM_GB = new RegExp('(\\d{2,4})' + S + '*GB', 'g');
    var ROM_TB = new RegExp('(\\d)' + S + '*TB', 'g');
    var RAM_OK = newSet([2, 3, 4, 6, 8, 12, 16, 24, 32]);
    var RAM_FIN = new RegExp(S + '(\\d{1,2})$');
    var RAM_GUION = /-(\d{2})-/;
    function notDigDot(c) { return !/^[\d.]$/.test(c); }

    function atributos(u, cats, out) {
      function any(list) { return list.some(function (x) { return cats.has(x); }); }
      var lav = any(['lavadora', 'lavasecadora', 'secadora']);
      if (lav) {
        var m = KG.exec(u);
        if (m) {
          out.set('kg', num(m[1]));
          if (g(m[2]).length > 0) out.set('kg2', Number(m[2]));
        } else {
          var k = KG_MULTI.exec(u);
          if (k) out.set('kg', Number(k[1]));
        }
      }
      if (any(['lavadora', 'lavasecadora'])) {
        var r = RPM.exec(u);
        if (r) out.set('rpm', Number(r[1]));
      }
      if (cats.has('lavavajillas')) {
        var sv = SERV.exec(u);
        if (sv) out.set('sv', Number(sv[1]));
      }
      if (any(['horno', 'congelador', 'combi', 'frigo', 'americano'])) {
        var l = findFrom(LITROS, u, 0, litrosPrev);
        if (l) out.set('lt', Number(l[1]));
      }
      if (any(['placa', 'horno'])) {
        var z = ZONAS.exec(u);
        if (z) out.set('zn', Number(z[1]));
      }
      if (cats.has('aire')) {
        var f = FRIG.exec(u);
        if (f) out.set('fr', Number(f[1]));
      }
      if (any(['movil', 'portatil', 'tablet'])) memoria(u, out);
    }

    function gigas(v, unit) { return Number(v) * (unit === 'TB' ? 1024.0 : 1.0); }

    function memoria(u, out) {
      var ram = 0, rom = 0;
      var i, m;
      var pm = findAll(PAR_MEM, u, null);
      for (i = 0; i < pm.length; i++) {
        m = pm[i];
        var x = gigas(m[1], g(m[2]));
        var y = gigas(m[3], g(m[4]));
        var lo = Math.min(x, y);
        var hi = Math.max(x, y);
        if (RAM_OK.has(kInt(lo)) && hi >= 64) {
          ram = kInt(lo);
          rom = kInt(hi);
          break;
        }
      }
      if (ram === 0) {
        var r1 = findAll(RAM_1, u, notDigDot);
        for (i = 0; i < r1.length; i++) {
          var v = parseInt(r1[i][1], 10);
          if (RAM_OK.has(v)) { ram = v; break; }
        }
      }
      if (ram === 0) {
        var gu = RAM_GUION.exec(u);
        if (gu && RAM_OK.has(parseInt(gu[1], 10))) ram = parseInt(gu[1], 10);
      }
      if (ram === 0) {
        var fi = RAM_FIN.exec(u);
        if (fi && RAM_OK.has(parseInt(fi[1], 10))) ram = parseInt(fi[1], 10);
      }
      if (rom === 0) {
        var rg = findAll(ROM_GB, u, notDigDot);
        for (i = 0; i < rg.length; i++) {
          var v2 = parseInt(rg[i][1], 10);
          if (v2 >= 64) { rom = v2; break; }
        }
      }
      if (rom === 0) {
        var rt = findFrom(ROM_TB, u, 0, notDigDot);
        if (rt) rom = parseInt(rt[1], 10) * 1024;
      }
      if (ram > 0) out.set('ram', ram);
      if (rom > 0) out.set('rom', rom);
    }

    var CLASES = [
      new RegExp('CLASE' + S + '+(?:ENERGETICA' + S + '+|ENERG\\.?' + S + '*)?([A-G])\\b'),
      new RegExp('(?:BLANCO|BLANCA|INOX|INOXIDABLE|NEGRO|NEGRA|CRISTAL|CRISTA)' + S + '+([A-G])\\b'),
      new RegExp('KG' + S + '+([A-G])\\b'),
      new RegExp('\\d' + S + '*L' + S + '+([A-G])\\b'),
      new RegExp('\\bCL' + S + '+([A-G])\\b')
    ];
    function clase(u) {
      for (var i = 0; i < CLASES.length; i++) {
        var m = CLASES[i].exec(u);
        if (m) return m[1].toLowerCase();
      }
      return '';
    }

    return { parse: parse, norm: norm };
  })();

  // ───────── Consulta ─────────

  function Cat(label, tags) { this.label = label; this.tags = tags; } // tags: array

  var Parser = (function () {
    var UNITS = mapOf({ dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 });
    var SPECIAL = mapOf({
      diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
      dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
      veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
      veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29
    });
    var TENS = mapOf({
      treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
      ochenta: 80, noventa: 90
    });
    var HUND = mapOf({
      cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300,
      trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500,
      quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700,
      setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900,
      novecientas: 900
    });
    var NUM_RX = /^\d+(\.\d+)?$/;
    function isNum(t) { return NUM_RX.test(t); }

    function small(tk, i) {
      if (i >= tk.length) return null;
      var t = tk[i];
      var ten = TENS.get(t);
      if (ten !== undefined) {
        if (i + 2 < tk.length && tk[i + 1] === 'y') {
          var u = UNITS.get(tk[i + 2]);
          if (u !== undefined) return [ten + u, 3];
        }
        return [ten, 1];
      }
      var sp = SPECIAL.get(t);
      if (sp !== undefined) return [sp, 1];
      var un = UNITS.get(t);
      if (un !== undefined) return [un, 1];
      return null;
    }

    function numbers(tk) {
      var out = [];
      var i = 0;
      while (i < tk.length) {
        var v = 0;
        var j = i;
        if (tk[j] === 'mil') {
          v = 1000;
          j += 1;
        } else if (UNITS.has(tk[j]) && j + 1 < tk.length && tk[j + 1] === 'mil') {
          v = UNITS.get(tk[j]) * 1000;
          j += 2;
        }
        if (j < tk.length && HUND.has(tk[j]) && !(j > i && v === 0)) {
          v += HUND.get(tk[j]);
          j += 1;
        }
        var s = small(tk, j);
        if (s !== null) {
          v += s[0];
          j += s[1];
        }
        if (j > i) {
          out.push(String(v));
          i = j;
        } else {
          out.push(tk[i]);
          i += 1;
        }
      }
      var fin = [];
      var k = 0;
      while (k < out.length) {
        if (k + 2 < out.length && isNum(out[k]) && (out[k + 1] === 'punto' || out[k + 1] === 'coma') &&
          isNum(out[k + 2]) && out[k + 2].indexOf('.') < 0) {
          fin.push(out[k] + '.' + out[k + 2]);
          k += 3;
        } else {
          fin.push(out[k]);
          k += 1;
        }
      }
      return fin;
    }

    var MERGE2 = mapOf({
      'lava\u0000secadora': 'lavasecadora', 'lavadora\u0000secadora': 'lavasecadora',
      'lava\u0000vajillas': 'lavavajillas', 'lava\u0000platos': 'lavavajillas',
      'multi\u0000door': 'multidoor', 'french\u0000door': 'multidoor',
      'new\u0000pol': 'newpol', 'super\u0000precio': 'superprecio',
      'super\u0000chollos': 'chollos', 'soporte\u0000wall': 'soporte'
    });

    function merge(tk) {
      var out = [];
      var i = 0;
      while (i < tk.length) {
        if (i + 2 < tk.length && tk[i] === 'side' && tk[i + 1] === 'by' && tk[i + 2] === 'side') {
          out.push('sbs');
          i += 3;
          continue;
        }
        if (i + 1 < tk.length) {
          var m = MERGE2.get(tk[i] + '\u0000' + tk[i + 1]);
          if (m !== undefined) {
            out.push(m);
            i += 2;
            continue;
          }
        }
        out.push(tk[i]);
        i += 1;
      }
      return out;
    }

    var CATS = new Map();
    (function () {
      function add(c) { for (var i = 1; i < arguments.length; i++) CATS.set(arguments[i], c); }
      add(new Cat('Televisor', ['tv']), 'tv', 'tele', 'teles', 'television', 'televisor', 'televisores', 'pantalla', 'pantallas');
      add(new Cat('Consola', ['consola']), 'consola', 'consolas', 'ps5', 'playstation', 'xbox');
      add(new Cat('Móvil', ['movil']), 'telefono', 'telefonos', 'movil', 'moviles', 'smartphone', 'smartphones', 'iphone', 'terminal');
      add(new Cat('Portátil', ['chromebook', 'windows', 'mac']), 'portatil', 'portatiles', 'ordenador', 'ordenadores', 'laptop', 'pc');
      add(new Cat('Chromebook', ['chromebook']), 'chrome', 'chromebook', 'chromebooks', 'cromebook', 'crome');
      add(new Cat('Windows', ['windows']), 'windows');
      add(new Cat('Mac', ['mac']), 'mac', 'macbook');
      add(new Cat('Tablet', ['tablet']), 'tablet', 'tablets', 'tableta', 'tabletas');
      add(new Cat('Reloj', ['reloj']), 'reloj', 'relojes', 'smartwatch', 'wearable');
      add(new Cat('Impresora', ['impresora']), 'impresora', 'impresoras', 'multifuncion');
      add(new Cat('Monitor', ['monitor']), 'monitor', 'monitores');
      add(new Cat('Combi', ['combi']), 'combi', 'combis', 'combinado', 'combinados');
      add(new Cat('Frigorífico', ['combi', 'frigo', 'americano']), 'frigorifico', 'frigorificos', 'frigo', 'frigos', 'nevera', 'neveras');
      add(new Cat('Americano', ['americano']), 'americano', 'americanos', 'sbs', 'multidoor');
      add(new Cat('Congelador', ['congelador']), 'congelador', 'congeladores', 'arcon', 'arcones');
      add(new Cat('Lavadora', ['lavadora']), 'lavadora', 'lavadoras');
      add(new Cat('Secadora', ['secadora']), 'secadora', 'secadoras');
      add(new Cat('Lavasecadora', ['lavasecadora']), 'lavasecadora', 'lavasecadoras');
      add(new Cat('Lavavajillas', ['lavavajillas']), 'lavavajillas', 'lavavavajillas', 'lavaplatos');
      add(new Cat('Horno', ['horno']), 'horno', 'hornos');
      add(new Cat('Placa', ['placa']), 'placa', 'placas', 'vitro', 'vitros', 'vitroceramica', 'vitroceramicas', 'encimera', 'encimeras');
      add(new Cat('Campana', ['campana']), 'campana', 'campanas');
      add(new Cat('Cafetera', ['cafetera']), 'cafetera', 'cafeteras');
      add(new Cat('Aire acondicionado', ['aire']), 'aire', 'acondicionado', 'split');
      add(new Cat('Ventilador', ['ventilador']), 'ventilador', 'ventiladores');
      add(new Cat('Barra de sonido', ['barra']), 'barra', 'barras', 'soundbar');
      add(new Cat('Altavoz', ['altavoz']), 'altavoz', 'altavoces');
      add(new Cat('Sonido', ['barra', 'altavoz']), 'sonido');
    })();

    var BRANDS = new Map();
    (function () {
      var list = [
        'samsung', 'lg', 'hisense', 'tcl', 'vivo', 'infiniton', 'candy', 'midea', 'bosch', 'beko', 'apple', 'hp',
        'balay', 'oppo', 'asus', 'haier', 'indesit', 'cecotec', 'acer', 'toshiba', 'xiaomi', 'lenovo', 'tecno',
        'primux', 'canon', 'amazfit', 'frigelux', 'aspes', 'solac', 'melitta', 'delonghi', 'jbl', 'sony', 'philips',
        'panasonic', 'microsoft', 'newpol', 'motorola', 'honor', 'realme', 'huawei', 'dyson', 'smeg', 'teka',
        'whirlpool', 'electrolux', 'siemens', 'neff', 'grundig', 'nokia', 'zte', 'poco', 'nespresso', 'taurus',
        'ariston', 'fagor', 'corbero', 'zanussi', 'braun'
      ];
      list.forEach(function (b) { BRANDS.set(b, b); });
      BRANDS.set('iphone', 'apple'); BRANDS.set('macbook', 'apple'); BRANDS.set('galaxy', 'samsung');
      BRANDS.set('redmi', 'xiaomi');
      BRANDS.set('opo', 'oppo'); BRANDS.set('chaomi', 'xiaomi'); BRANDS.set('shaomi', 'xiaomi');
      BRANDS.set('ps5', 'sony'); BRANDS.set('playstation', 'sony');
      BRANDS.set('xbox', 'microsoft'); BRANDS.set('ele', 'lg');
    })();

    var UNITW = mapOf({
      kilos: 'kg', kilo: 'kg', kg: 'kg', kilogramos: 'kg',
      servicios: 'sv', servicio: 'sv', cubiertos: 'sv',
      litros: 'lt', litro: 'lt', l: 'lt',
      rpm: 'rpm', revoluciones: 'rpm',
      zonas: 'zn', zona: 'zn', fuegos: 'zn', focos: 'zn',
      alto: 'al', alta: 'al', altura: 'al',
      ancho: 'an', ancha: 'an', anchura: 'an',
      fondo: 'fo', profundidad: 'fo', profundo: 'fo',
      cm: 'dim', centimetros: 'dim', centimetro: 'dim',
      metros: 'm', metro: 'm', m: 'm', mt: 'm', mts: 'm',
      pulgadas: 'in', pulgada: 'in',
      gb: 'gb', g: 'gb', giga: 'gb', gigas: 'gb', gigabyte: 'gb', gigabytes: 'gb',
      tb: 'tb', tera: 'tb', teras: 'tb',
      euros: 'eur', euro: 'eur', eur: 'eur',
      frigorias: 'fr', frigoria: 'fr'
    });
    var FILL = newSet(['de', 'del', 'los', 'las']);
    var SEP = newSet(['y', 'o', 'e', 'u']);
    var MAX_WORDS = newSet(['menos', 'menor', 'hasta', 'maximo', 'max', 'debajo', 'bajo', 'inferior']);
    var MIN_WORDS = newSet(['mas', 'mayor', 'desde', 'partir', 'minimo', 'superior', 'encima']);
    var EURO = newSet(['euros', 'euro', 'eur']);
    var OFFER_WORDS = mapOf({
      superprecio: 'superprecio', chollos: 'chollos', oferta: 'any', ofertas: 'any',
      rebajado: 'any', rebajados: 'any', rebajas: 'any'
    });
    var STOCK_WORDS = newSet(['stock', 'disponible', 'disponibles', 'existencias']);
    var CHEAP = newSet(['barato', 'barata', 'baratos', 'baratas', 'economico', 'economica', 'economicos', 'economicas']);
    var PRICEY = newSet(['caro', 'cara', 'caros', 'caras', 'premium']);
    var STOP = newSet([
      'quiero', 'busca', 'buscame', 'dame', 'dime', 'necesito', 'muestrame', 'ver', 'pon', 'hola', 'un', 'una',
      'uno', 'unos', 'unas', 'de', 'del', 'con', 'y', 'o', 'e', 'u', 'el', 'la', 'los', 'las', 'al', 'que',
      'tenga', 'tengan', 'tiene', 'tienen', 'para', 'en', 'por', 'favor', 'a', 'mas', 'menos', 'es', 'son',
      'sea', 'hay', 'algun', 'alguno', 'mi', 'su', 'me', 'lo', 'se', 'si', 'no', 'x', 'punto', 'coma', 'clase',
      'mejor', 'mejores', 'articulos', 'articulo', 'producto', 'productos', 'algo', 'cosa', 'cosas',
      'menor', 'mayor', 'hasta', 'maximo', 'max', 'debajo', 'bajo', 'inferior', 'desde', 'partir', 'minimo',
      'superior', 'encima', 'frost', 'nofrost'
    ]);
    var RAM_OK = newSet([2, 3, 4, 6, 8, 12, 16, 24, 32]);

    var DIMW = new Map();
    UNITW.forEach(function (u, w) { if (u === 'al' || u === 'an' || u === 'fo') DIMW.set(w, u); });
    var METROS = newSet(['metros', 'metro', 'm', 'mt', 'mts']);
    var CMW = newSet(['cm', 'centimetros', 'centimetro']);
    var LINK = newSet(['que', 'a']);
    // "más de / menos de" no incluyen el número; "desde / hasta / mínimo / máximo" sí
    var ESTRICTO = newSet(['mas', 'mayor', 'superior', 'encima', 'menos', 'menor', 'inferior', 'debajo', 'bajo']);
    // "dos metros o más", "185 o menos": -1 = de ahí hacia arriba, 1 = hacia abajo
    var DESPUES = mapOf({ mas: -1, mayor: -1, superior: -1, menos: 1, menor: 1, inferior: 1 });
    var FRIDGE = ['combi', 'frigo', 'americano', 'congelador'];
    var HOB = ['placa', 'horno', 'campana'];
    // Colores: si se piden, no se relajan (si no hay en inox, no se enseñan blancos)
    var COLORES = newSet(['blanco', 'negro', 'inox']);
    var TOL_METROS = 3.0; // "más o menos dos metros" = ±3 cm

    function Rango(min, minEx, max, maxEx) { this.min = min; this.minEx = minEx; this.max = max; this.maxEx = maxEx; }
    Rango.prototype.ok = function (x) {
      return (this.min === null || (this.minEx ? x > this.min : x >= this.min)) &&
        (this.max === null || (this.maxEx ? x < this.max : x <= this.max));
    };

    // "un metro ..." -> "1 metro ..."
    function unMetro(tk) {
      return tk.map(function (t, i) {
        return ((t === 'un' || t === 'uno' || t === 'una') && i + 1 < tk.length && METROS.has(tk[i + 1])) ? '1' : t;
      });
    }

    // Longitud en cm: {cm, end, fuzzy, metros} o null. fuzzy = metros redondos ("dos metros"): ±3 cm
    function length(tk, j) {
      var n = tk.length;
      if (j >= n || !isNum(tk[j])) return null;
      if (j + 1 >= n) return null;
      var v = Number(tk[j]);
      var u = tk[j + 1];
      if (METROS.has(u) && v < 10) {
        var cm = Math.round(v * 100.0);
        var end = j + 2;
        var fuzzy = v === Math.floor(v); // "dos metros" aproximado; "1,85 metros" exacto
        // "un metro ochenta y cinco" -> 185
        if (v === Math.floor(v) && v <= 2.0 && end < n && isNum(tk[end]) && tk[end].indexOf('.') < 0) {
          var x = Number(tk[end]);
          if (x >= 1.0 && x <= 99.0) {
            var k = end + 1;
            while (k < n && FILL.has(tk[k])) k += 1;
            var otraMedida = k < n && (DIMW.has(tk[k]) || tk[k] === 'x' || tk[k] === 'por');
            if (!otraMedida) {
              cm += x;
              end += 1;
              fuzzy = false;
              if (end < n && CMW.has(tk[end])) end += 1;
            }
          }
        }
        return { cm: cm, end: end, fuzzy: fuzzy, metros: true };
      }
      if (CMW.has(u)) return { cm: v, end: j + 2, fuzzy: false, metros: false };
      return null;
    }

    function cmpWord(t) { return MAX_WORDS.has(t) ? 1 : (MIN_WORDS.has(t) ? -1 : 0); }

    function parse(text, cat) {
      var tk = numbers(unMetro(merge(Texto.tokens(text))));
      var n = tk.length;
      var used = [];
      for (var z = 0; z < n; z++) used.push(false);
      var specs = new Map();
      var energy = [];
      var pMin = null;
      var pMax = null;
      var rangos = new Map();
      var fridgeQ = tk.some(function (w) { var c0 = CATS.get(w); return c0 !== undefined && c0.tags.some(function (x) { return FRIDGE.indexOf(x) >= 0; }); });
      var hobQ = tk.some(function (w) { var c0 = CATS.get(w); return c0 !== undefined && c0.tags.some(function (x) { return HOB.indexOf(x) >= 0; }); });
      var defDim = (hobQ && !fridgeQ) ? 'an' : 'al';

      function add(u, vs) {
        var l = specs.get(u);
        if (l === undefined) { l = []; specs.set(u, l); }
        for (var a = 0; a < vs.length; a++) if (l.indexOf(vs[a]) < 0) l.push(vs[a]);
      }
      function addRango(dim, cmp, v, ex) {
        var r = rangos.get(dim);
        rangos.set(dim, cmp === -1
          ? new Rango(v, ex, r ? r.max : null, r ? r.maxEx : false)
          : new Rango(r ? r.min : null, r ? r.minEx : false, v, ex));
      }

      // Coloca una longitud suelta: exacta, aproximada (metros redondos) o con "o más / o menos". Devuelve el final.
      function placeLen(len, dimDada) {
        var end = len.end;
        var dim = dimDada;
        var k = end;
        while (k < n && FILL.has(tk[k])) k += 1;
        if (dim === null && k < n && DIMW.has(tk[k])) { dim = DIMW.get(tk[k]); end = k + 1; }
        var cmp = 0;
        if (end + 1 < n && SEP.has(tk[end]) && DESPUES.has(tk[end + 1])) {
          cmp = DESPUES.get(tk[end + 1]);
          end += 2;
        } else if (end + 1 < n && tk[end] === 'en' && tk[end + 1] === 'adelante') {
          cmp = -1;
          end += 2;
        } else if (end + 1 < n && tk[end] === 'para' && (tk[end + 1] === 'arriba' || tk[end + 1] === 'abajo')) {
          cmp = tk[end + 1] === 'arriba' ? -1 : 1;
          end += 2;
        }
        var d = dim !== null ? dim : ((len.metros || (fridgeQ && len.cm >= 100.0)) ? defDim : 'dim');
        var dr = d === 'dim' ? defDim : d;
        if (cmp !== 0) addRango(dr, cmp, len.cm, false);
        else if (len.fuzzy) rangos.set(dr, new Rango(len.cm - TOL_METROS, false, len.cm + TOL_METROS, false));
        else add(d, [len.cm]);
        return end;
      }

      function addUnit(u, vs) {
        if (u === 'gb') {
          for (var a = 0; a < vs.length; a++) add(RAM_OK.has(kInt(vs[a])) ? 'ram' : 'rom', [vs[a]]);
        } else if (u === 'tb') {
          add('rom', vs.map(function (x) { return x * 1024.0; }));
        } else add(u, vs);
      }

      var i = 0;
      while (i < n) {
        if (used[i]) { i += 1; continue; }
        var t = tk[i];

        if (t === 'clase' && i + 1 < n && /^[a-g]$/.test(tk[i + 1])) {
          if (energy.indexOf(tk[i + 1]) < 0) energy.push(tk[i + 1]);
          used[i] = true;
          used[i + 1] = true;
          i += 2;
          continue;
        }

        var cmp = cmpWord(t);
        if (cmp !== 0) {
          // "más de dos metros", "menor de 185 cm", o precio: "menos de 400 euros", "desde 300", "hasta 500"
          var j = i + 1;
          var dimExp = null;
          while (j < n && (FILL.has(tk[j]) || LINK.has(tk[j]) || DIMW.has(tk[j]))) {
            if (DIMW.has(tk[j])) dimExp = DIMW.get(tk[j]);
            j += 1;
          }
          if (j < n && isNum(tk[j])) {
            var v = Number(tk[j]);
            var end = j + 1;
            var conEuro = end < n && EURO.has(tk[end]);

            var len = length(tk, j);
            var cm = v;
            var esMedida = false;
            if (len !== null) {
              cm = len.cm;
              end = len.end;
              esMedida = true;
            } else if (!conEuro) {
              var kk = end;
              while (kk < n && FILL.has(tk[kk])) kk += 1;
              if (kk < n && DIMW.has(tk[kk])) esMedida = true;
              else if (dimExp !== null) esMedida = true;
              else if (fridgeQ && v >= 100.0 && v <= 230.0) esMedida = true; // "combi mayor de 185"
            }
            if (esMedida) {
              var k3 = end;
              while (k3 < n && FILL.has(tk[k3])) k3 += 1;
              if (k3 < n && DIMW.has(tk[k3])) { if (dimExp === null) dimExp = DIMW.get(tk[k3]); end = k3 + 1; }
              addRango(dimExp !== null ? dimExp : defDim, cmp, cm, ESTRICTO.has(t));
              for (var qm = i; qm < end; qm++) used[qm] = true;
              i = end;
              continue;
            }

            var end2p = j + 1;
            var otraUnidad = !conEuro && end2p < n && UNITW.has(tk[end2p]);
            var fin = conEuro ? end2p + 1 : end2p;
            if (conEuro || (v >= 50 && !otraUnidad)) {
              if (cmp === 1) pMax = v; else pMin = v;
              for (var q = i; q < fin; q++) used[q] = true;
              i = fin;
              continue;
            }
          }
          i += 1;
          continue;
        }

        if (UNITW.has(t)) {
          var j2 = i + 1;
          while (j2 < n && FILL.has(tk[j2])) j2 += 1;
          if (j2 < n && DIMW.has(t) && length(tk, j2) !== null) {
            // "alto 2 metros", "altura 185 cm"
            var endL = placeLen(length(tk, j2), DIMW.get(t));
            for (var ql = i; ql < endL; ql++) used[ql] = true;
            i = endL;
            continue;
          }
          if (j2 < n && isNum(tk[j2]) && UNITW.get(t) !== 'eur') {
            var vals = [];
            vals.push(Number(tk[j2]));
            var k = j2 + 1;
            while (k + 1 < n && SEP.has(tk[k]) && isNum(tk[k + 1])) {
              vals.push(Number(tk[k + 1]));
              k += 2;
            }
            addUnit(UNITW.get(t), vals);
            for (var q2 = i; q2 < k; q2++) used[q2] = true;
            i = k;
            continue;
          }
          used[i] = true;
          i += 1;
          continue;
        }

        if (isNum(t)) {
          var len0 = length(tk, i);
          if (len0 !== null) {
            var endLen = placeLen(len0, null);
            for (var qn = i; qn < endLen; qn++) used[qn] = true;
            i = endLen;
            continue;
          }
        }

        if (isNum(t)) {
          var vals2 = [];
          vals2.push(Number(t));
          var j3 = i + 1;
          while (j3 + 1 < n && SEP.has(tk[j3]) && isNum(tk[j3 + 1])) {
            vals2.push(Number(tk[j3 + 1]));
            j3 += 2;
          }
          var k2 = j3;
          while (k2 < n && FILL.has(tk[k2])) k2 += 1;
          if (vals2.length === 1 && k2 + 1 < n && (tk[k2] === 'por' || tk[k2] === 'x') && isNum(tk[k2 + 1])) {
            add('al', vals2);
            add('an', [Number(tk[k2 + 1])]);
            var end2 = k2 + 2;
            if (end2 < n && (tk[end2] === 'cm' || tk[end2] === 'centimetros')) end2 += 1;
            for (var q3 = i; q3 < end2; q3++) used[q3] = true;
            i = end2;
            continue;
          }
          var end3;
          if (k2 < n && UNITW.has(tk[k2])) {
            var u = UNITW.get(tk[k2]);
            if (u === 'eur') pMax = Math.max.apply(null, vals2); else addUnit(u, vals2);
            end3 = k2 + 1;
          } else {
            add('any', vals2);
            end3 = j3;
          }
          for (var q4 = i; q4 < end3; q4++) used[q4] = true;
          i = end3;
          continue;
        }
        i += 1;
      }

      var cats = [];
      var brands = [];
      var offers = [];
      var needStock = false;
      var sort = 0;
      for (var idx = 0; idx < n; idx++) {
        if (used[idx]) continue;
        var tt = tk[idx];
        var c = CATS.get(tt);
        if (c !== undefined && !cats.some(function (x) { return setEq(x.tags, c.tags); })) cats.push(c);
        var b = BRANDS.get(tt);
        if (b !== undefined && brands.indexOf(b) < 0) brands.push(b);
        var o = OFFER_WORDS.get(tt);
        if (o !== undefined && offers.indexOf(o) < 0) offers.push(o);
        if (STOCK_WORDS.has(tt)) needStock = true;
        if (CHEAP.has(tt)) sort = 1;
        if (PRICEY.has(tt)) sort = -1;
      }
      var especificas = cats.filter(function (a) {
        return cats.some(function (b) {
          return b !== a && b.tags.every(function (x) { return a.tags.indexOf(x) >= 0; }) && a.tags.length > b.tags.length;
        });
      });
      cats = cats.filter(function (x) { return especificas.indexOf(x) < 0; });

      var kws = [];
      for (var idx2 = 0; idx2 < n; idx2++) {
        if (used[idx2]) continue;
        var t2 = tk[idx2];
        if (CATS.has(t2) || BRANDS.has(t2) || STOP.has(t2) || UNITW.has(t2) ||
          OFFER_WORDS.has(t2) || STOCK_WORDS.has(t2) || CHEAP.has(t2) || PRICEY.has(t2)) continue;
        if (t2.length >= 2 && !isNum(t2) && cat.vocab.has(t2) && kws.indexOf(t2) < 0) kws.push(t2);
      }

      if (cats.length === 0) {
        var a2 = specs.get('any');
        if (a2 !== undefined) {
          var tvs = a2.filter(function (x) { return x === Math.floor(x) && cat.tvSizes.has(kInt(x)); });
          if (tvs.length > 0) {
            cats.push(CATS.get('tv'));
            specs.delete('any');
            add('in', tvs);
            var resto = a2.filter(function (x) { return tvs.indexOf(x) < 0; });
            if (resto.length > 0) add('any', resto);
          }
        }
        if (cats.length === 0 && specs.has('in')) cats.push(CATS.get('tv'));
      }

      var vacio = cats.length === 0 && brands.length === 0 && specs.size === 0 && rangos.size === 0 && kws.length === 0 &&
        energy.length === 0 && pMin === null && pMax === null && offers.length === 0 && !needStock && sort === 0;
      if (vacio) return null;

      var lista = cats.length === 0 ? [null] : cats;
      return lista.map(function (c) {
        return {
          cat: c, brands: brands.slice(), nums: specs, rangos: rangos, energy: energy.slice(), kws: kws.slice(),
          priceMin: pMin, priceMax: pMax, offers: offers.slice(), needStock: needStock, sort: sort
        };
      });
    }

    function close(a, b) { return a !== undefined && a !== null && a > 0.0 && Math.abs(a - b) < 0.6; }

    function numOk(i, unit, v) {
      switch (unit) {
        case 'kg': return close(i.nums.get('kg'), v) || close(i.nums.get('kg2'), v);
        case 'dim': return close(i.nums.get('al'), v) || close(i.nums.get('an'), v) || close(i.nums.get('fo'), v);
        case 'any': {
          var found = false;
          i.nums.forEach(function (x) { if (close(x, v)) found = true; });
          return found || (v === Math.floor(v) && i.words.has(String(kInt(v))));
        }
        default: return close(i.nums.get(unit), v);
      }
    }

    function coincide(i, f, conPalabras, conStock) {
      var c = f.cat;
      if (c !== null && !c.tags.some(function (x) { return i.cats.has(x); })) return false;
      if (f.brands.length > 0 && f.brands.indexOf(i.brand) < 0) return false;
      if (f.energy.length > 0 && f.energy.indexOf(i.energy) < 0) return false;
      var ok = true;
      f.nums.forEach(function (vs, u) {
        if (!ok) return;
        if (!vs.some(function (x) { return numOk(i, u, x); })) ok = false;
      });
      if (!ok) return false;
      var okR = true;
      f.rangos.forEach(function (r, u) {
        if (!okR) return;
        var x = i.nums.get(u);
        if (x === undefined || !r.ok(x)) okR = false;
      });
      if (!okR) return false;
      if (f.priceMin !== null && i.price < f.priceMin) return false;
      if (f.priceMax !== null && i.price > f.priceMax) return false;
      for (var k = 0; k < f.offers.length; k++) if (!i.offerKeys.has(f.offers[k])) return false;
      if (conPalabras && f.kws.some(function (w) { return !i.words.has(w); })) return false;
      if (conStock) {
        var min = Math.max(i.minStock, f.needStock ? 1 : 0);
        if (i.stock < min) return false;
      }
      return true;
    }

    function kcmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

    function ordenar(l, sort) {
      var cmp;
      if (sort === 1) cmp = function (a, b) { return kcmp(a.price, b.price) || kcmp(b.supPct, a.supPct) || kcmp(b.stock, a.stock); };
      else if (sort === -1) cmp = function (a, b) { return kcmp(b.price, a.price) || kcmp(b.supPct, a.supPct) || kcmp(b.stock, a.stock); };
      else cmp = function (a, b) { return kcmp(b.supPct, a.supPct) || kcmp(a.price, b.price) || kcmp(b.stock, a.stock); };
      return l.map(function (x, idx) { return { x: x, idx: idx }; })
        .sort(function (a, b) { return cmp(a.x, b.x) || (a.idx - b.idx); })
        .map(function (w) { return w.x; });
    }

    function fmt(v) {
      return v === Math.floor(v) ? String(kInt(v)) : kStr(v).replace('.', ',');
    }

    var SIGLAS = newSet(['hp', 'lg', 'tcl', 'jbl', 'zte']);
    function marcaBonita(b) {
      return SIGLAS.has(b) ? b.toUpperCase() : b.substring(0, 1).toUpperCase() + b.substring(1);
    }

    function titulo(f) {
      var p = [];
      if (f.cat) p.push(f.cat.label);
      if (f.brands.length > 0) p.push(f.brands.map(marcaBonita).join(' / '));
      f.nums.forEach(function (vs, u) {
        var s = vs.map(fmt).join(' / ');
        var r;
        switch (u) {
          case 'in': r = s + ' pulgadas'; break;
          case 'kg': r = s + ' kg'; break;
          case 'sv': r = s + ' servicios'; break;
          case 'lt': r = s + ' litros'; break;
          case 'rpm': r = s + ' rpm'; break;
          case 'zn': r = s + ' zonas'; break;
          case 'al': r = 'alto ' + s + ' cm'; break;
          case 'an': r = 'ancho ' + s + ' cm'; break;
          case 'fo': r = 'fondo ' + s + ' cm'; break;
          case 'dim': r = s + ' cm'; break;
          case 'ram': r = s + ' GB RAM'; break;
          case 'rom': r = vs.map(function (x) { return x >= 1024 ? fmt(x / 1024) + ' TB' : fmt(x) + ' GB'; }).join(' / '); break;
          case 'fr': r = s + ' frigorías'; break;
          default: r = s;
        }
        p.push(r);
      });
      f.rangos.forEach(function (r, u) {
        var nom = u === 'an' ? 'ancho' : (u === 'fo' ? 'fondo' : 'alto');
        var lo = r.min;
        var hi = r.max;
        if (lo !== null && hi !== null) p.push(nom + ' ' + fmt(lo) + '–' + fmt(hi) + ' cm');
        else if (lo !== null) p.push(nom + (r.minEx ? ' más de ' : ' desde ') + fmt(lo) + ' cm');
        else if (hi !== null) p.push(nom + (r.maxEx ? ' menos de ' : ' hasta ') + fmt(hi) + ' cm');
        else p.push(nom);
      });
      if (f.energy.length > 0) p.push('clase ' + f.energy.map(function (x) { return x.toUpperCase(); }).join(' / '));
      if (f.priceMin !== null && f.priceMax !== null) p.push(fmt(f.priceMin) + '–' + fmt(f.priceMax) + ' €');
      else if (f.priceMax !== null) p.push('hasta ' + fmt(f.priceMax) + ' €');
      else if (f.priceMin !== null) p.push('desde ' + fmt(f.priceMin) + ' €');
      f.offers.forEach(function (o) { p.push(o === 'superprecio' ? 'Super precio' : (o === 'chollos' ? 'Chollos' : 'con oferta')); });
      f.kws.forEach(function (k) { p.push(k.toUpperCase()); });
      if (f.needStock) p.push('con stock');
      if (f.sort === 1) p.push('más baratos');
      if (f.sort === -1) p.push('más caros');
      return p.join(' · ');
    }

    function copyFil(f, cambios) {
      var g = {};
      for (var k in f) g[k] = f[k];
      for (var k2 in cambios) g[k2] = cambios[k2];
      return g;
    }

    function ejecutar(q, cat) {
      var out = [];
      q.forEach(function (f) {
        function buscarCon(ff, conStock) {
          return ordenar(cat.items.filter(function (it) { return coincide(it, ff, true, conStock); }), f.sort).slice(0, MAX_RESULTS);
        }
        var found = buscarCon(f, true);
        var nota = '';
        var ocultos = [];
        // Los colores (inox, blanco, negro) nunca se relajan: si no hay en inox, no se enseñan blancos
        var colores = f.kws.filter(function (w) { return COLORES.has(w); });
        var otras = f.kws.filter(function (w) { return !COLORES.has(w); });
        var suave = copyFil(f, { kws: colores });
        if (found.length === 0 && otras.length > 0) {
          var alt = buscarCon(suave, true);
          if (alt.length > 0) {
            found = alt;
            nota = 'Sin filtrar por: ' + otras.join(', ');
          }
        }
        if (found.length === 0) {
          var sinStock = cat.items.filter(function (it) { return coincide(it, f, true, false); }).length;
          if (sinStock > 0) {
            ocultos = buscarCon(f, false);
            nota = sinStock === 1 ? 'Hay 1 artículo, pero sin el stock necesario.'
              : 'Hay ' + sinStock + ' artículos, pero sin el stock necesario.';
          }
        }
        if (found.length === 0 && nota.length === 0) {
          // Relajación: medidas poco fiables, altura exacta y clase energética
          var flojas = new Map();
          f.nums.forEach(function (vs, u) { if (u === 'dim' || u === 'any') flojas.set(u, vs); });
          var resto = new Map();
          f.nums.forEach(function (vs, u) { if (!flojas.has(u)) resto.set(u, vs); });
          var pasos = [];
          var flojasTxt = [];
          flojas.forEach(function (vs) { flojasTxt.push(vs.map(fmt).join('/')); });
          if (flojas.size > 0) {
            pasos.push([copyFil(suave, { nums: resto }), 'Sin filtrar por: ' + flojasTxt.join(', ')]);
          }
          var alto = f.nums.get('al');
          if (alto !== undefined && alto.length === 1 && !f.rangos.has('al')) {
            var sinAl = new Map(f.nums);
            sinAl.delete('al');
            var rg = new Map(f.rangos);
            rg.set('al', new Rango(alto[0] - 5.0, false, alto[0] + 5.0, false));
            pasos.push([copyFil(suave, { nums: sinAl, rangos: rg }),
              'No hay de ' + fmt(alto[0]) + ' cm de alto exactos; se muestran los de ±5 cm.']);
          }
          if (f.energy.length > 0) {
            pasos.push([copyFil(suave, { nums: resto, energy: [] }),
              'Sin filtrar por: clase ' + f.energy.map(function (x) { return x.toUpperCase(); }).join('/') +
              (flojas.size > 0 ? ' y medida' : '')]);
          }
          for (var p = 0; p < pasos.length; p++) {
            var alt2 = buscarCon(pasos[p][0], true);
            if (alt2.length > 0) { found = alt2; nota = pasos[p][1]; break; }
          }
        }
        if (found.length === 0 && nota.length === 0 && colores.length > 0) {
          nota = 'No hay en ' + colores.join(' / ') + ' con lo que has pedido.';
        }
        out.push({ titulo: titulo(f), items: found, nota: nota, ocultos: ocultos });
      });
      return out;
    }

    return { parse: parse, ejecutar: ejecutar };
  })();

  // ───────── API pública ─────────

  function parseCatalogo(jsText) {
    return Datos.parse(jsText);
  }

  function buscar(texto, cat) {
    var q = Parser.parse(texto, cat);
    if (q === null) return null;
    return Parser.ejecutar(q, cat);
  }

  return { parseCatalogo: parseCatalogo, buscar: buscar, _kStr: kStr };
})();

if (typeof module !== 'undefined') module.exports = Logica;
