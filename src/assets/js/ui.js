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
