// Load this before the engine: even broken imports must report visible errors.
function showError(error) {
  document.getElementById('fallback-title').textContent = 'Astrava startup error';
  document.getElementById('error-detail').textContent = error?.message || String(error);
  document.getElementById('runtime-status').textContent = 'Startup failed';
  document.getElementById('fallback').hidden = false;
}
addEventListener('error', event => showError(event.error || event.message));
addEventListener('unhandledrejection', event => showError(event.reason));
document.getElementById('reload-engine').addEventListener('click', () => location.reload());
import('./main.js').catch(showError);
