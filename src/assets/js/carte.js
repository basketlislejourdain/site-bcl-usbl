/*
 * Carte interactive des 4 salles (Leaflet + fond OpenStreetMap).
 * S'affiche dans chaque élément [data-carte]. Les positions sont tirées de la
 * Base Adresse Nationale (api-adresse.data.gouv.fr) puis gardées en mémoire dans le navigateur.
 * Pour corriger une position : renseigner lat / lon ci-dessous (ils priment sur la recherche).
 */
(function () {
  'use strict';
  var SALLES = [
    { code: 'GS', nom: 'Gasco’Sports', adresse: '33 rue de Rozès', q: '33 rue de Rozès', color: '#1D5FD1', lat: 43.6057, lon: 1.0782,
      usage: 'Salle principale : entraînements et matchs' },
    { code: 'GY', nom: 'Halle des sports Louise-Michel', adresse: '17 avenue du Courdé', q: '17 avenue du Courdé', color: '#B35400',
      usage: 'Deuxième salle, local associatif' },
    { code: 'SP', nom: 'Salle polyvalente Yves-Caubet', adresse: 'Rue des Réfractaires-et-des-Maquisards', q: 'rue des Réfractaires et Maquisards', color: '#1E7F45',
      usage: 'Un ou deux entraînements par semaine' },
    { code: 'LM', nom: 'Complexe Lœtitia-Moussard-Loubens', adresse: '15 rue François-Darolles', q: '15 rue François Darolles', color: '#6B3FB5',
      usage: 'Renforcement, technique, 3x3 loisirs' }
  ];
  var VILLE = '32600 L’Isle-Jourdain';
  var CENTRE = [43.6136, 1.0808];
  var base = (document.querySelector('script[src*="assets/js/carte.js"]') || {}).src || '';
  base = base.replace(/js\/carte\.js.*$/, '');

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  function locate(s) {
    if (s.lat) return Promise.resolve([s.lat, s.lon]);
    var key = 'carte:' + s.q, hit = store(key);
    if (hit) return Promise.resolve(hit);
    var url = 'https://api-adresse.data.gouv.fr/search/?limit=1&postcode=32600&q=' + encodeURIComponent(s.q + ' L\'Isle-Jourdain');
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      var c = d.features && d.features[0] && d.features[0].geometry.coordinates;
      if (!c) return null;
      var pos = [c[1], c[0]]; store(key, pos); return pos;
    }).catch(function () { return null; });
  }

  var loading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, ko) {
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      var js = document.createElement('script'); js.src = base + 'vendor/leaflet/leaflet.js'; js.onload = ok; js.onerror = ko; document.head.appendChild(js);
    });
    return loading;
  }

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function draw(el) {
    el.setAttribute('data-carte-ok', '');
    loadLeaflet().then(function () {
      var map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView(CENTRE, 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);
      var pts = [];
      Promise.all(SALLES.map(function (s) {
        return locate(s).then(function (pos) {
          if (!pos) return;
          pts.push(pos);
          var icon = L.divIcon({ className: 'carte-pin', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18],
            html: '<span style="background:' + s.color + '">' + s.code + '</span>' });
          var dest = encodeURIComponent(s.nom + ', ' + s.adresse + ', ' + VILLE);
          L.marker(pos, { icon: icon, title: s.nom, alt: s.nom }).addTo(map).bindPopup(
            '<strong>' + esc(s.nom) + '</strong><br>' + esc(s.adresse) + ', ' + esc(VILLE) +
            '<br><span style="color:#4A5260">' + esc(s.usage) + '</span><br>' +
            '<a href="https://www.google.com/maps/dir/?api=1&destination=' + dest + '" target="_blank" rel="noopener">Itinéraire →</a>');
        });
      })).then(function () {
        if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 });
      });
      // la carte peut naître dans un bloc dont la taille change : on la recale
      setTimeout(function () { map.invalidateSize(); }, 300);
    }).catch(function () {
      el.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#4A5260;padding:16px;text-align:center">La carte n’a pas pu se charger.</div>';
    });
  }

  function scan() {
    var els = document.querySelectorAll('[data-carte]:not([data-carte-ok])');
    for (var i = 0; i < els.length; i++) draw(els[i]);
  }
  document.addEventListener('dc:render', scan);
  document.addEventListener('DOMContentLoaded', scan);
})();
