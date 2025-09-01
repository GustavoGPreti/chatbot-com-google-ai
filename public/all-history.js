// all-history.js

document.addEventListener('DOMContentLoaded', () => {
  loadAllHistoricos();
  document.getElementById('refresh-all-history').addEventListener('click', loadAllHistoricos);
});

function renderAllHistoricos(sessions) {
  const list = document.getElementById('all-history-list');
  if (!sessions.length) {
    list.innerHTML = '<div class="loading-message">Nenhuma conversa encontrada</div>';
    return;
  }
  list.innerHTML = sessions.map(session => {
    const startDate = new Date(session.startTime);
    const formattedTime = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const duration = formatDuration(session.duration);
    return `
      <div class="history-item" data-session-id="${session.sessionId}">
        <div class="history-item-header">
          <div class="history-item-title">
            ${session.titulo || `Conversa ${session.sessionId.substring(0, 8)}...`}
          </div>
        </div>
        <div class="history-item-preview">${session.preview || 'Sem prévia disponível'}</div>
        <div class="history-item-stats">
          <span>⏰ ${formattedTime}</span>
          <span>💬 ${session.messageCount} msgs</span>
          <span>⏱️ ${duration}</span>
        </div>
      </div>
    `;
  }).join('');
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

async function loadAllHistoricos() {
  const list = document.getElementById('all-history-list');
  list.innerHTML = '<div class="loading-message">Carregando todos os históricos...</div>';
  try {
    const res = await fetch('/api/chat/historicos?limit=100&order=desc');
    const data = await res.json();
    renderAllHistoricos(data.sessions || []);
  } catch (err) {
    list.innerHTML = '<div class="error-message">Erro ao carregar históricos</div>';
  }
}
