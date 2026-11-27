/*
 * Contenus modifiables depuis l'espace admin : actus, événements, albums photos, bandeau d'alerte.
 * Ils sont lus dans docs/data/*.json au chargement de la page (voir DC.boot dans dc.js)
 * et mis en forme ici pour les pages (ordinateur et mobile).
 */
(function () {
  'use strict';
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
  var CLUBS = {
    bcl: { label: 'BCL · filles', court: 'BCL', color: '#E0301E', ink: '#FFFFFF' },
    usbl: { label: 'USBL · garçons', court: 'USBL', color: '#F2C14E', ink: '#0D1117' },
    commun: { label: 'Commun', court: 'BCL + USBL', color: '#D9D5CC', ink: '#0D1117' }
  };

  function data() { return window.SITE_DATA || {}; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(iso) { var p = (iso || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function club(c) { return CLUBS[c] || CLUBS.commun; }

  // Actus : les plus récentes d'abord, sans celles dont la date de fin est passée
  function actus() {
    var t = today();
    return (data().actus || []).filter(function (a) { return !a.fin || a.fin >= t; })
      .slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })
      .map(function (a) {
        var d = parse(a.date);
        return Object.assign({}, a, {
          dateAff: a.dateTexte || (d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) : ''),
          lien: a.lien || '#'
        });
      });
  }

  // Événements à venir, du plus proche au plus lointain ; ceux sans date à la fin
  function evenements() {
    var t = today(), m = t.slice(0, 7);
    return (data().evenements || []).filter(function (e) {
      if (e.date) return (e.dateFin || e.date) >= t;
      if (e.mois) return e.mois >= m;
      return true;
    }).map(function (e, i) {
      var d = parse(e.date), key = e.date || (e.mois ? e.mois + '-99' : '9999-' + pad(i));
      var groupe = d ? cap(MOIS[d.getMonth()]) + ' ' + d.getFullYear()
        : e.mois ? cap(MOIS[+e.mois.slice(5) - 1]) + ' ' + e.mois.slice(0, 4)
        : (e.periode || 'Date à venir');
      return Object.assign({}, e, club(e.club), {
        key: key, groupe: groupe,
        jour: d ? String(d.getDate()) : '–',
        jourSemaine: d ? JOURS[d.getDay()] : 'Date à venir',
        moisCourt: d ? MOIS_COURT[d.getMonth()] : e.mois ? MOIS_COURT[+e.mois.slice(5) - 1] : 'à venir',
        sousTitre: [e.lieu, e.heure, e.details].filter(Boolean).join(' · ')
      });
    }).sort(function (a, b) { return a.key.localeCompare(b.key); });
  }

  // Regroupe une liste d'événements par mois : [{ name, items }]
  function parMois(list) {
    var out = [], idx = {};
    list.forEach(function (e) {
      if (!(e.groupe in idx)) { idx[e.groupe] = out.length; out.push({ name: e.groupe, items: [] }); }
      out[idx[e.groupe]].items.push(e);
    });
    return out;
  }

  // Albums photos, les plus récents d'abord
  function albums() {
    return (data().albums || []).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })
      .map(function (a) { return Object.assign({}, a, { tag: club(a.club).court, tagBg: a.club === 'bcl' ? '#E0301E' : a.club === 'usbl' ? '#F2C14E' : '#0D1117', tagFg: a.club === 'usbl' ? '#0D1117' : '#FFFFFF' }); });
  }

  // Bandeau d'alerte en haut de toutes les pages
  function bandeau() {
    var b = data().bandeau;
    if (!b || !b.actif || !b.message) return;
    if (b.fin && b.fin < today()) return;
    if (document.getElementById('bandeau-alerte')) return;
    var el = document.createElement('div');
    el.id = 'bandeau-alerte';
    el.setAttribute('role', 'status');
    var txt = document.createElement('span');
    txt.textContent = b.message;
    el.appendChild(txt);
    if (b.lien) {
      var a = document.createElement('a');
      a.href = b.lien; a.textContent = (b.texteLien || 'En savoir plus') + ' →';
      el.appendChild(a);
    }
    document.body.insertBefore(el, document.body.firstChild);
  }

  window.Contenu = { actus: actus, evenements: evenements, parMois: parMois, albums: albums, bandeau: bandeau, club: club };
})();
