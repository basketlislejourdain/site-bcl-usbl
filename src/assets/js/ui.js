/*
 * Petits comportements des pages mobiles statiques.
 * Filtres : boutons data-mfilter="Libellé" ; dans la même <section>, chaque carte
 * qui contient une étiquette portant ce libellé reste visible, les autres sont masquées
 * (ainsi que les intertitres de mois devenus vides).
 */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-mfilter]');
    if (!btn) return;
    var group = btn.parentNode, section = btn.closest('section');
    var pills = Array.prototype.slice.call(group.querySelectorAll('[data-mfilter]'));
    if (!group.__styles) group.__styles = { on: pills[0].getAttribute('style'), off: pills[1].getAttribute('style') };
    pills.forEach(function (p) {
      var on = p === btn;
      p.setAttribute('style', on ? group.__styles.on : group.__styles.off);
      p.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var value = btn.getAttribute('data-mfilter');
    var labels = pills.map(function (p) { return p.getAttribute('data-mfilter'); });
    var kids = Array.prototype.slice.call(section.children);
    kids.forEach(function (k) {
      if (k === group || k.contains(group) || /^H[1-3]$/.test(k.tagName)) return;
      var tags = Array.prototype.slice.call(k.querySelectorAll('span')).map(function (s) { return s.textContent.trim(); })
        .filter(function (t) { return labels.indexOf(t) >= 0; });
      if (!tags.length) return;
      k.hidden = !(value === labels[0] || tags.indexOf(value) >= 0);
    });
    kids.forEach(function (k, i) {
      if (k.tagName !== 'H3') return;
      var any = false;
      for (var j = i + 1; j < kids.length && kids[j].tagName !== 'H3'; j++) if (!kids[j].hidden) any = true;
      k.hidden = !any;
    });
  });
})();

/* Onglets (bloc « Matchs du week-end » de l'accueil) : boutons data-mtab, panneaux data-mpanel. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('[data-mtab]');
    if (!tab) return;
    var group = tab.closest('[data-mtabs]'), n = tab.getAttribute('data-mtab');
    group.querySelectorAll('[data-mtab]').forEach(function (t) {
      var on = t === tab;
      t.setAttribute('style', t.getAttribute(on ? 'data-style-on' : 'data-style-off'));
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    group.querySelectorAll('[data-mpanel]').forEach(function (p) {
      var on = p.getAttribute('data-mpanel') === n;
      // le panneau inactif est sorti de l'écran (et non masqué) : le widget Score'n'co
      // force son cadre en visible, ce qui annulerait un simple masquage
      p.style.position = on ? '' : 'absolute';
      p.style.top = on ? '' : '0';
      p.style.left = on ? '' : '-200vw';
      p.style.width = on ? '' : '100%';
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
  });
})();

/* « Lire la suite » : bouton data-more-toggle qui affiche / masque le bloc data-more juste avant lui. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-more-toggle]');
    if (!btn) return;
    var more = btn.previousElementSibling;
    if (!more || !more.hasAttribute('data-more')) return;
    var open = more.hidden;
    more.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Réduire ↑' : 'Lire la suite ↓';
    if (!open) btn.closest('article, section, div').scrollIntoView({ block: 'nearest' });
  });
})();

/* Menus des filtres (page Équipes) : après un clic à la souris, on retire le focus
   pour que le menu se referme quand le pointeur s'en va (au clavier, il reste ouvert). */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    if (!e.detail) return; // clic au clavier
    var b = e.target.closest && e.target.closest('.fwrap button');
    if (b) b.blur();
  });
})();
