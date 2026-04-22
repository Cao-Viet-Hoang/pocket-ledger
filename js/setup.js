/**
 * First-run setup screen — collects Firebase credentials + username,
 * calls `Store.configure`, then hands off to the router.
 *
 * Config is entered as a single JSON/JS-object blob (same shape Firebase
 * gives you on the project settings page) so users can paste-and-go.
 */
(function (global) {
  'use strict';

  const PLACEHOLDER = `{
  apiKey: "AIzaSy...",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
}`;

  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatConfig(config) {
    if (!config || typeof config !== 'object') return '';
    // Emit as a JS object literal (unquoted keys) for readability — same shape
    // as what the Firebase console shows.
    const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const lines = keys
      .filter((k) => config[k] != null && config[k] !== '')
      .map((k) => `  ${k}: ${JSON.stringify(config[k])}`);
    if (!lines.length) return '';
    return `{\n${lines.join(',\n')}\n}`;
  }

  /**
   * Parse Firebase config from a textarea. Accepts both strict JSON and the
   * JS-object-literal shape shown in the Firebase console (unquoted keys,
   * trailing commas, single quotes). Throws on invalid input.
   */
  function parseConfig(text) {
    let raw = String(text || '').trim();
    if (!raw) throw new Error('Config is empty');

    // If the user pasted `const firebaseConfig = {...};`, grab just the object.
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace > 0 && lastBrace > firstBrace) {
      raw = raw.slice(firstBrace, lastBrace + 1);
    }

    // Try strict JSON first.
    try { return JSON.parse(raw); } catch (_) {}
    // Fallback: evaluate as a JS expression. Safe enough for a user pasting
    // their own config — this is a personal, client-side app.
    try {
      // eslint-disable-next-line no-new-func
      const value = Function('"use strict"; return (' + raw + ');')();
      if (!value || typeof value !== 'object') throw new Error('Not an object');
      return value;
    } catch (err) {
      throw new Error('Invalid config — expected a JSON / JS object');
    }
  }

  function formHTML(initial) {
    const c = initial || {};
    const configText = formatConfig(c);
    return `
      <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4)">
        ${I18n.t('setup.description')}
      </p>

      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('setup.username')}</label>
        <input type="text" class="input" id="setupUsername" value="${escapeAttr(c.username || '')}" autocomplete="off" placeholder="e.g. hoang"/>
        <small class="text-muted" style="font-size: var(--fs-xs)">${I18n.t('setup.usernameHint')}</small>
      </div>

      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('setup.config')}</label>
        <textarea
          class="textarea code"
          id="setupConfig"
          rows="10"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          placeholder="${escapeAttr(PLACEHOLDER)}"
        >${escapeAttr(configText)}</textarea>
        <small class="text-muted" style="font-size: var(--fs-xs)">${I18n.t('setup.configHint')}</small>
      </div>

      <label class="form-group" style="flex-direction: row; align-items: center; gap: var(--space-2); margin-top: var(--space-3)">
        <input type="checkbox" id="fbSeed"/>
        <span>${I18n.t('setup.seedSample')}</span>
      </label>

      <div id="setupError" class="text-expense" style="font-size: var(--fs-sm); margin-top: var(--space-3); display:none"></div>
    `;
  }

  function readValues() {
    const root = document.getElementById('modalRoot');
    const username = root.querySelector('#setupUsername').value.trim();
    const configText = root.querySelector('#setupConfig').value;
    const seed = root.querySelector('#fbSeed').checked;
    return { username, configText, seed };
  }

  function showError(message) {
    const box = document.getElementById('setupError');
    if (!box) return;
    if (message) {
      box.style.display = 'block';
      box.textContent = message;
    } else {
      box.style.display = 'none';
      box.textContent = '';
    }
  }

  function setConnecting(btn, connecting) {
    if (!btn) return;
    btn.disabled = connecting;
    btn.textContent = connecting ? I18n.t('setup.connecting') : I18n.t('setup.connect');
  }

  function buildInitialValues() {
    const currentConfig = Store.getConfig();
    const currentUsername = Store.getUsername();
    const current = currentConfig && currentUsername
      ? { config: currentConfig, username: currentUsername }
      : null;
    const saved = Store.getStoredCredentials();
    const lastUsed = Store.getLastUsedCredentials();
    const source = current || saved || lastUsed;
    return source
      ? Object.assign({ username: source.username }, source.config || {})
      : {};
  }

  function open({ onDone } = {}) {
    const initial = buildInitialValues();

    Modal.open({
      title: I18n.t('setup.title'),
      subtitle: I18n.t('setup.subtitle'),
      size: 'lg',
      bodyHTML: formHTML(initial),
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: I18n.t('setup.connect'),
          variant: 'primary',
          keepOpen: true,
          onClick: async (ev) => {
            const btn = ev.currentTarget;
            const { username, configText, seed } = readValues();

            if (!username) { showError(I18n.t('setup.errUsername')); return; }

            let config;
            try {
              config = parseConfig(configText);
            } catch (err) {
              showError(err.message || I18n.t('setup.errConfig'));
              return;
            }
            if (!config.apiKey || !config.projectId) {
              showError(I18n.t('setup.errFields'));
              return;
            }

            try {
              showError('');
              setConnecting(btn, true);
              await Store.configure({ config, username, seedSample: seed });
              Modal.close();
              Toast.show(I18n.t('setup.connected'));
              if (typeof onDone === 'function') onDone();
            } catch (err) {
              console.error(err);
              setConnecting(btn, false);
              showError((err && err.message) || 'Connection failed');
            }
          }
        }
      ]
    });
  }

  global.Setup = { open };
})(window);
