// Paste into the Script tab in Appfarm Create.
//
// Generic editor for the email content classes (EmailLayout,
// EmailTemplateStandard, EmailTemplate). Which class this instance is
// editing is inferred from which optional inputs got bound in this
// placement — see component.json and CLAUDE.md's Email templates section:
//   - layoutHtml unbound            -> this instance IS the layout
//   - layoutHtml bound, standardHtml unbound -> this instance IS the standard body
//   - both bound                    -> this instance is a per-type template

const ns = appfarm;

const safeGet = (ds) => ds?.get?.() ?? null;

/** @type {HTMLDivElement} */
const root = /** @type {HTMLDivElement} */ (ns.element.querySelector('#email-html-editor'));
const htmlInput = /** @type {HTMLTextAreaElement} */ (root.querySelector('#eht-html'));
const textRow = /** @type {HTMLDivElement} */ (root.querySelector('#eht-text-row'));
const textInput = /** @type {HTMLTextAreaElement} */ (root.querySelector('#eht-text'));
const saveButton = /** @type {HTMLButtonElement} */ (root.querySelector('#eht-save'));
const revertButton = /** @type {HTMLButtonElement} */ (root.querySelector('#eht-revert'));
const status = /** @type {HTMLSpanElement} */ (root.querySelector('#eht-status'));
const previewFrame = /** @type {HTMLIFrameElement} */ (root.querySelector('#eht-preview-frame'));

const hasText = safeGet(ns.data.text) != null;

const state = {
    html: '',
    text: '',
    dirty: false,
};

let previewTimer = null;

function loadFromData() {
    state.html = safeGet(ns.data.html) || '';
    state.text = hasText ? (safeGet(ns.data.text) || '') : '';
    state.dirty = false;

    htmlInput.value = state.html;
    if (hasText) textInput.value = state.text;
}

function updatePreview() {
    const layoutHtml = safeGet(ns.data.layoutHtml);
    const standardHtml = safeGet(ns.data.standardHtml);

    let composed;
    if (layoutHtml == null) {
        // This instance is the layout itself — nothing to wrap it in.
        composed = state.html;
    } else {
        // ponytail: presence is inferred from a non-empty value, so a real
        // but literally empty standard/template body reads as "unbound" —
        // acceptable for an admin-only editor, not worth a second signal.
        const content = state.html || standardHtml || '';
        composed = layoutHtml.replace('{{content}}', content);
    }

    previewFrame.srcdoc = composed;
}

function scheduleUpdatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 200);
}

function setStatus(text, dataState) {
    status.textContent = text;
    if (dataState) status.dataset.state = dataState;
    else delete status.dataset.state;
}

function handleSave() {
    saveButton.disabled = true;
    setStatus('Saving…');

    // No id — actions are contextual to the record this instance is placed on.
    const payload = { html: state.html };
    if (hasText) payload.text = state.text;

    // Deliberate .then/.catch here, unlike this repo's usual fire-and-forget
    // action calls — this is an explicit user-triggered save, not an
    // optimistic drag/resize, so surfacing failure matters.
    appfarm.actions?.save?.(payload)
        .then(() => {
            state.dirty = false;
            setStatus('Saved', 'saved');
        })
        .catch((err) => {
            setStatus('Failed to save', 'error');
            console.error('[email-html-editor] save failed', err);
        })
        .finally(() => {
            saveButton.disabled = false;
        });
}

function handleRevert() {
    loadFromData();
    setStatus('Reverted');
    updatePreview();
}

function init() {
    textRow.hidden = !hasText;

    loadFromData();
    updatePreview();

    htmlInput.addEventListener('input', () => {
        state.html = htmlInput.value;
        state.dirty = true;
        scheduleUpdatePreview();
    });
    htmlInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const { selectionStart, selectionEnd, value } = htmlInput;
        htmlInput.value = value.slice(0, selectionStart) + '\t' + value.slice(selectionEnd);
        htmlInput.selectionStart = htmlInput.selectionEnd = selectionStart + 1;
        state.html = htmlInput.value;
        state.dirty = true;
        scheduleUpdatePreview();
    });

    if (hasText) {
        textInput.addEventListener('input', () => {
            state.text = textInput.value;
            state.dirty = true;
        });
    }
    saveButton.addEventListener('click', handleSave);
    revertButton.addEventListener('click', handleRevert);

    // Reference data (layout/standard) always trusted live — only the
    // fields this instance itself owns are held back while dirty.
    ns.data.layoutHtml?.on?.('change', scheduleUpdatePreview);
    ns.data.standardHtml?.on?.('change', scheduleUpdatePreview);
    ns.data.html?.on?.('change', () => { if (!state.dirty) loadFromData(); updatePreview(); });
    if (hasText) ns.data.text?.on?.('change', () => { if (!state.dirty) loadFromData(); });
}

if (document.readyState !== 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}

ns.on?.('unload', () => {
    clearTimeout(previewTimer);
});
