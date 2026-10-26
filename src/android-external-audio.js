// ES5-only Android ACTION_VIEW audio handoff. This does not decode audio,
// install anything, or promise that an old Via WebView will dispatch intents.
(function (root) {
  'use strict';
  function intentUrl(mediaUrl, mime) {
    var input = String(mediaUrl || '');
    // Signed media links may contain query strings, but must never inject
    // additional #Intent directives or non-network schemes.
    var match = /^(https?):\/\/([^\/?#]+)(\/[^#]*)?$/i.exec(input);
    if (!match || !match[2] || /[@;\s]/.test(match[2])) return '';
    var type = mime === 'audio/wav' ? 'audio/wav' : 'audio/mpeg';
    var path = (match[3] || '/').replace(/;/g, '%3B');
    return 'intent://' + match[2] + path +
      '#Intent;scheme=' + match[1].toLowerCase() +
      ';action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE' +
      ';type=' + type + ';end';
  }
  function attachLink(anchor, mediaUrl, mime) {
    if (!anchor) return false;
    var target = intentUrl(mediaUrl, mime);
    if (!target) {
      anchor.removeAttribute('href');
      anchor.setAttribute('aria-disabled', 'true');
      return false;
    }
    anchor.href = target;
    anchor.removeAttribute('aria-disabled');
    return true;
  }
  root.LXAndroidExternalAudio = { buildIntentUrl: intentUrl, attachLink: attachLink };
})(window);
