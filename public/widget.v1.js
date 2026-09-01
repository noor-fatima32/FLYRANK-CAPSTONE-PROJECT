(function () {
  const currentScript = document.currentScript;
  if (!currentScript) return;

  const scriptUrl = new URL(currentScript.src);
  const widgetId = scriptUrl.searchParams.get('id');
  if (!widgetId) {
    console.error('[EmbedWidget] Missing widget id parameter in script tag');
    return;
  }

  const baseUrl = scriptUrl.origin;

  fetch(`${baseUrl}/public/widgets/${widgetId}/config`)
    .then(function (res) {
      if (!res.ok) throw new Error('Widget config not found');
      return res.json();
    })
    .then(function (config) {
      renderWidget(config, baseUrl, currentScript);
    })
    .catch(function (err) {
      console.error('[EmbedWidget] Error loading config:', err.message);
    });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderWidget(config, apiBase, scriptNode) {
    const idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    const container = document.createElement('div');
    container.className = 'embed-widget-container';
    container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    container.style.border = '1px solid #e2e8f0';
    container.style.borderRadius = '8px';
    container.style.padding = '20px';
    container.style.maxWidth = '400px';
    container.style.margin = '10px 0';
    container.style.backgroundColor = '#ffffff';
    container.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';

    let fieldsHtml = '';
    config.fields.forEach(function (field) {
      const requiredAttr = field.required ? 'required' : '';
      fieldsHtml += `
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 14px; font-weight: 500; color: #334155; margin-bottom: 4px;">
            ${escapeHtml(field.label || field.name)} ${field.required ? '*' : ''}
          </label>
          <input type="${field.type || 'text'}" name="${escapeHtml(field.name)}" ${requiredAttr}
                 style="width: 100%; padding: 8px 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;" />
        </div>
      `;
    });

    container.innerHTML = `
      <form class="embed-widget-form">
        ${config.title ? `<h3 style="margin: 0 0 8px 0; font-size: 18px; color: #0f172a;">${escapeHtml(config.title)}</h3>` : ''}
        ${config.description ? `<p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b;">${escapeHtml(config.description)}</p>` : ''}
        
        <!-- Honeypot field for bot protection -->
        <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none !important;" />
        
        ${fieldsHtml}
        
        <div class="embed-widget-feedback" style="display:none; padding: 8px; margin-bottom: 12px; font-size: 14px; border-radius: 4px;"></div>

        <button type="submit" style="width: 100%; padding: 10px; font-size: 14px; font-weight: 600; color: #ffffff; background-color: #3b82f6; border: none; border-radius: 6px; cursor: pointer;">
          ${escapeHtml(config.button_text || 'Submit')}
        </button>
      </form>
    `;

    scriptNode.parentNode.insertBefore(container, scriptNode.nextSibling);

    const form = container.querySelector('.embed-widget-form');
    const feedback = container.querySelector('.embed-widget-feedback');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const formData = new FormData(form);
      const dataPayload = {};
      let gotchaValue = '';

      formData.forEach(function (value, key) {
        if (key === '_gotcha') {
          gotchaValue = value;
        } else {
          dataPayload[key] = value;
        }
      });

      const body = {
        widget_id: config.id,
        data: dataPayload,
        _gotcha: gotchaValue,
        idempotency_key: idempotencyKey
      };

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerText = 'Submitting...';

      fetch(`${apiBase}/api/v1/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (resObj) {
          btn.disabled = false;
          btn.innerText = config.button_text || 'Submit';

          if (resObj.status >= 200 && resObj.status < 300) {
            feedback.style.display = 'block';
            feedback.style.backgroundColor = '#dcfce7';
            feedback.style.color = '#15803d';
            feedback.innerText = 'Thank you! Submission received.';
            form.reset();
          } else {
            feedback.style.display = 'block';
            feedback.style.backgroundColor = '#fee2e2';
            feedback.style.color = '#b91c1c';
            feedback.innerText = resObj.data.error || 'Submission failed.';
          }
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.innerText = config.button_text || 'Submit';
          feedback.style.display = 'block';
          feedback.style.backgroundColor = '#fee2e2';
          feedback.style.color = '#b91c1c';
          feedback.innerText = 'Network error. Please try again.';
        });
    });
  }
})();