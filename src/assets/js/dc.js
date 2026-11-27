/*
 * dc.js — petit moteur qui affiche les pages du site à partir des maquettes.
 *
 * Chaque composant est un <template id="dc-c-NOM"> (le HTML de la maquette)
 * associé à une classe JavaScript (sa logique : données, clics, filtres).
 * Syntaxe reprise des maquettes :
 *   {{chemin.vers.valeur}}                    texte ou attribut
 *   <template data-sc-for list="{{x}}" as="it">  boucle
 *   <template data-sc-if value="{{x}}">          condition
 *   <template data-dc-import name="Header" ...>  inclusion d'un composant
 *   onClick="{{fonction}}" / onChange="{{fonction}}"
 */
(function () {
  'use strict';

  var registry = {};      // nom -> { cls, defaults }
  var instances = {};     // clé de position -> instance
  var mounted = [];       // instances à « monter » après le rendu
  var pending = false;
  var root = null;        // { el, name }

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (update) {
    var u = typeof update === 'function' ? update(this.state, this.props) : update;
    this.state = Object.assign({}, this.state, u);
    schedule();
  };
  DCLogic.prototype.renderVals = function () { return {}; };
  window.DCLogic = DCLogic;

  function define(name, cls, defaults) { registry[name] = { cls: cls, defaults: defaults || {} }; }

  // ---------- expressions ----------
  var RE = /\{\{([^}]*)\}\}/g;
  var WHOLE = /^\s*\{\{([^}]*)\}\}\s*$/;
  function lookup(scope, expr) {
    var p = expr.trim();
    if (p === 'true') return true;
    if (p === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(p)) return Number(p);
    var parts = p.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    if (str.indexOf('{{') < 0) return str;
    var m = str.match(WHOLE);
    if (m) return lookup(scope, m[1]);
    return str.replace(RE, function (_, e) { var v = lookup(scope, e); return v == null ? '' : String(v); });
  }
  function truthy(v) { return !!v && v !== 'false' && v !== '0'; }

  // ---------- rendu ----------
  function renderComponent(name, props, key, out) {
    var def = registry[name];
    var tpl = document.getElementById('dc-c-' + name);
    if (!def || !tpl) { console.warn('Composant introuvable : ' + name); return; }
    var fullProps = Object.assign({}, def.defaults, props);
    var inst = instances[key];
    if (!inst || inst.__name !== name) {
      inst = new def.cls(fullProps);
      inst.__name = name;
      instances[key] = inst;
      mounted.push(inst);
    } else {
      inst.props = fullProps;
    }
    var vals;
    try { vals = inst.renderVals() || {}; } catch (e) { console.error(name, e); vals = {}; }
    var ctx = { key: key, n: 0 };
    renderChildren(tpl.content, vals, out, ctx);
  }

  function renderChildren(src, scope, out, ctx) {
    for (var c = src.firstChild; c; c = c.nextSibling) renderNode(c, scope, out, ctx);
  }

  function renderNode(src, scope, out, ctx) {
    if (src.nodeType === 3) {
      var t = interp(src.data, scope);
      out.appendChild(document.createTextNode(t == null || t === false ? '' : String(t)));
      return;
    }
    if (src.nodeType !== 1) return;
    var tag = src.localName;
    if (tag === 'template') {
      if (src.hasAttribute('data-sc-for')) {
        var list = interp(src.getAttribute('list') || '', scope) || [];
        var as = src.getAttribute('as') || 'item';
        for (var i = 0; i < list.length; i++) {
          var s = Object.create(scope);
          s[as] = list[i];
          renderChildren(src.content, s, out, ctx);
        }
      } else if (src.hasAttribute('data-sc-if')) {
        if (truthy(interp(src.getAttribute('value') || '', scope))) renderChildren(src.content, scope, out, ctx);
      } else if (src.hasAttribute('data-dc-import')) {
        var props = {};
        for (var a = 0; a < src.attributes.length; a++) {
          var at = src.attributes[a];
          if (at.name === 'name' || at.name === 'data-dc-import' || at.name.indexOf('hint-') === 0) continue;
          props[camel(at.name)] = interp(at.value, scope);
        }
        renderComponent(src.getAttribute('name'), props, ctx.key + '/' + (ctx.n++), out);
      }
      return;
    }
    var el = document.createElementNS(src.namespaceURI, src.localName);
    for (var j = 0; j < src.attributes.length; j++) {
      var attr = src.attributes[j], name = attr.name;
      if (name.indexOf('hint-') === 0) continue;
      if (name.length > 2 && name.slice(0, 2) === 'on' && WHOLE.test(attr.value)) {
        var fn = interp(attr.value, scope);
        if (typeof fn === 'function') { (el.__dcOn = el.__dcOn || {})[name.slice(2)] = fn; }
        continue;
      }
      var v = interp(attr.value, scope);
      if (v === false || v == null) continue;
      if (v === true) v = '';
      el.setAttribute(name, String(v));
    }
    renderChildren(src, scope, el, ctx);
    out.appendChild(el);
  }

  function camel(s) { return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }

  // ---------- mise à jour du DOM sans tout recréer ----------
  function morph(oldP, newP) {
    var o = oldP.firstChild, n = newP.firstChild;
    while (n) {
      var nextN = n.nextSibling;
      if (!o) { oldP.appendChild(n); n = nextN; continue; }
      var nextO = o.nextSibling;
      if (o.nodeType === n.nodeType && (o.nodeType === 3 || (o.nodeType === 1 && o.namespaceURI === n.namespaceURI && o.tagName === n.tagName))) {
        if (o.nodeType === 3) { if (o.data !== n.data) o.data = n.data; }
        else if (o.hasAttribute('data-dc-keep') && o.getAttribute('data-dc-keep') === n.getAttribute('data-dc-keep')) { /* contenu géré par un service externe (widget) */ }
        else { syncEl(o, n); morph(o, n); }
      } else {
        oldP.replaceChild(n, o);
      }
      o = nextO; n = nextN;
    }
    while (o) { var x = o.nextSibling; oldP.removeChild(o); o = x; }
  }
  function syncEl(o, n) {
    var i, a;
    for (i = o.attributes.length - 1; i >= 0; i--) { a = o.attributes[i].name; if (!n.hasAttribute(a)) o.removeAttribute(a); }
    for (i = 0; i < n.attributes.length; i++) { a = n.attributes[i]; if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value); }
    o.__dcOn = n.__dcOn;
    if (o.tagName === 'INPUT' && (o.type === 'checkbox' || o.type === 'radio')) o.checked = n.hasAttribute('checked');
    if (o.tagName === 'OPTION') o.selected = n.hasAttribute('selected');
  }

  // ---------- événements (délégués) ----------
  function dispatch(type, e) {
    for (var el = e.target; el && el !== document; el = el.parentNode) {
      var h = el.__dcOn && el.__dcOn[type];
      if (h) { h(e); return; }
    }
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#menu"], a[href="#close-menu"]');
    if (a) { e.preventDefault(); toggleMenu(a.getAttribute('href') === '#menu'); return; }
    dispatch('click', e);
  });
  document.addEventListener('change', function (e) { dispatch('change', e); });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !/checkbox|radio/.test(t.type))) dispatch('change', e);
  });

  // ---------- page ----------
  var cfg = null, mq = null, menuOpen = false;
  function currentName() { return mq && mq.matches ? cfg.mobile : cfg.desktop; }

  function render() {
    pending = false;
    if (!root) return;
    mounted = [];
    var frag = document.createElement('div');
    renderComponent(root.name, {}, root.name, frag);
    if (root.fresh) { root.el.innerHTML = ''; while (frag.firstChild) root.el.appendChild(frag.firstChild); root.fresh = false; }
    else morph(root.el, frag);
    if (menuOpen && cfg.menu) {
      var mf = document.createElement('div');
      renderComponent(cfg.menu, {}, 'menu', mf);
      morph(menuEl(), mf);
    }
    loadWidgets();
    var m = mounted; mounted = [];
    m.forEach(function (inst) { if (inst.componentDidMount) { try { inst.componentDidMount(); } catch (e) { console.error(e); } } });
  }
  // widgets Score'n'co : leur script est (re)chargé quand un nouveau widget apparaît
  function loadWidgets() {
    var fresh = document.querySelectorAll('.scorenco-widget:not([data-sc-loaded])');
    if (!fresh.length) return;
    for (var i = 0; i < fresh.length; i++) fresh[i].setAttribute('data-sc-loaded', '');
    var old = document.getElementById('scorenco-js');
    if (old) old.parentNode.removeChild(old);
    var s = document.createElement('script');
    s.id = 'scorenco-js'; s.async = true;
    s.src = 'https://widgets.scorenco.com/host/widgets.js';
    document.body.appendChild(s);
  }
  function schedule() { if (!pending) { pending = true; (window.requestAnimationFrame || setTimeout)(render); } }

  function menuEl() {
    var m = document.getElementById('dc-menu');
    if (!m) { m = document.createElement('div'); m.id = 'dc-menu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Menu'); document.body.appendChild(m); }
    return m;
  }
  function toggleMenu(open) {
    menuOpen = open;
    var m = menuEl();
    m.hidden = !open;
    document.documentElement.classList.toggle('dc-menu-open', open);
    if (open) { m.innerHTML = ''; render(); var first = m.querySelector('a'); if (first) first.focus(); }
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuOpen) toggleMenu(false); });

  function stopTimers() {
    Object.keys(instances).forEach(function (k) {
      var inst = instances[k];
      if (inst.componentWillUnmount) { try { inst.componentWillUnmount(); } catch (e) { /* rien */ } }
    });
    instances = {};
  }

  function boot(config) {
    cfg = config;
    mq = window.matchMedia('(max-width: ' + (config.breakpoint || 899) + 'px)');
    root = { el: document.getElementById('app'), name: currentName(), fresh: true };
    var onChange = function () {
      stopTimers();
      if (menuOpen) toggleMenu(false);
      root = { el: root.el, name: currentName(), fresh: true };
      render();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    render();
    if (location.hash && location.hash.length > 1) {
      var t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t) t.scrollIntoView();
    }
  }

  function get(name) { return registry[name] && registry[name].cls; }
  window.DC = { define: define, get: get, boot: boot, schedule: schedule };
})();
