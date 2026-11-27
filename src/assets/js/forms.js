/*
 * Formulaires sans serveur : le bouton « Envoyer » ouvre la messagerie du visiteur
 * avec un e-mail déjà rempli (destinataire, objet, contenu du formulaire).
 * Boutons concernés : attribut data-mailto="adresse[,adresse]" et data-subject="Objet".
 */
(function () {
  'use strict';
  var BCL = 'bclislois32@gmail.com', USBL = 'leclubusbl32@gmail.com';

  function labelText(label) {
    for (var n = label.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.data.trim()) return n.data.trim();
      if (n.nodeType === 1 && /^(SPAN|STRONG)$/.test(n.tagName) && n.textContent.trim()) return n.textContent.trim();
    }
    return 'Champ';
  }

  function recipients(defaults, lines) {
    var dest = '';
    lines.forEach(function (l) { if (/^Destinataire/.test(l)) dest = l; });
    if (!dest) return defaults;
    if (/USBL|garçons/.test(dest)) return USBL;
    if (/deux clubs|Partenariats/.test(dest)) return BCL + ',' + USBL;
    return BCL;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-mailto]');
    if (!btn) return;
    e.preventDefault();
    var box = btn.closest('section') || document.body;
    var lines = [];
    box.querySelectorAll('[aria-pressed="true"]').forEach(function (b) {
      lines.push('Choix : ' + b.textContent.replace(/\s+/g, ' ').trim());
    });
    box.querySelectorAll('label').forEach(function (label) {
      var f = label.querySelector('input, select, textarea');
      if (!f) return;
      if (f.type === 'checkbox' || f.type === 'radio') {
        if (f.checked) lines.push('Option : ' + label.textContent.replace(/\s+/g, ' ').trim());
        return;
      }
      var v = (f.tagName === 'SELECT' ? f.options[f.selectedIndex] && f.options[f.selectedIndex].text : f.value) || '';
      if (v.trim()) lines.push(labelText(label) + ' : ' + v.trim());
    });
    var aside = box.querySelector('aside');
    if (aside) lines.push('', 'Récapitulatif : ' + aside.innerText.replace(/\s*Envoyer ma demande[\s\S]*$/i, '').replace(/\s+/g, ' ').trim());
    var to = recipients(btn.getAttribute('data-mailto'), lines);
    var body = lines.join('\n') + '\n\n— Envoyé depuis le site du basket à L\'Isle-Jourdain';
    var url = 'mailto:' + to + '?subject=' + encodeURIComponent(btn.getAttribute('data-subject') || 'Message depuis le site') + '&body=' + encodeURIComponent(body);
    if (window.__onMailto) window.__onMailto(url); else window.location.href = url;
  });
})();
