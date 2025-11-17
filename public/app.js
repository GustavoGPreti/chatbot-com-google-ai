// Elementos do DOM
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const clearButton = document.getElementById("header-button");
const newChatButton = document.getElementById("new-chat");

// Novos elementos para histórico
const historyButton = document.getElementById("history-button");
const historyPanel = document.getElementById("history-panel");
const closeHistoryButton = document.getElementById("close-history");
const refreshHistoryButton = document.getElementById("refresh-history");
const historyList = document.getElementById("history-list");
const historyDetailSection = document.getElementById("history-detail-section");
const historyDetailContent = document.getElementById("history-detail-content");

// Funções do histórico
function toggleHistoryPanel() {
    if (historyPanel.classList.contains('open')) {
        historyPanel.classList.remove('open');
        clearHistoryDetail();
    } else {
        historyPanel.classList.add('open');
        carregarHistorico();
    }
}

async function carregarHistorico() {
    try {
        historyList.innerHTML = '<div class="loading-message">Carregando histórico...</div>';
        
        const response = await fetch('/api/chat/historicos');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar histórico');
        }
        
        historyData = data.sessions;
        renderizarListaHistorico();
    } catch (error) {
        historyList.innerHTML = `
            <div class="error-message">
                Erro ao carregar histórico: ${error.message}
            </div>
        `;
    }
}

function renderizarListaHistorico() {
    if (!historyData.length) {
        historyList.innerHTML = '<div class="loading-message">Nenhuma conversa encontrada</div>';
        return;
    }
    historyList.innerHTML = historyData.map(session => {
        const startDate = new Date(session.startTime);
        const formattedTime = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const duration = formatDuration(session.duration);
        return `
            <div class="history-item ${currentSelectedSession === session.sessionId ? 'selected' : ''}" data-session-id="${session.sessionId}">
                <div class="history-item-header">
                    <div class="history-item-title">
                        ${session.titulo || `Conversa ${session.sessionId.substring(0, 8)}...`}
                    </div>
                    <div class="history-item-actions">
                        <button class="title-button" data-action="gerar-titulo" title="Gerar título" type="button">✨</button>
                        <button class="delete-button" data-action="excluir" title="Excluir conversa" type="button">🗑️</button>
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

// Variáveis globais
let isWaitingForResponse = false;
let sessionId = Date.now().toString(); // Identificador único para cada sessão de chat

// B2.P1.A8 - Variáveis para histórico de sessão
let chatHistory = []; // Histórico completo da sessão
let sessionStartTime = new Date(); // Início da sessão
let messageCount = 0; // Contador de mensagens

// Variáveis para o painel de histórico
let currentSelectedSession = null;
let historyData = [];

// Função para obter informações do usuário (IP)
async function obterInformacoesUsuario() {
    try {
        const response = await fetch('/api/user-info');
        if (!response.ok) {
            throw new Error('Erro ao obter informações do usuário');
        }
        return await response.json();
    } catch (error) {
        console.error('Erro ao obter informações do usuário:', error);
        return { ip: 'unknown' };
    }
}

// Função para registrar conexão do usuário
async function registrarConexaoUsuario() {
    try {
        const userInfo = await obterInformacoesUsuario();
        
        const logData = {
            ip: userInfo.ip,
            acao: "acesso_inicial_chatbot"
        };

        const response = await fetch('/api/log-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(logData)
        });

        if (!response.ok) {
            throw new Error('Erro ao registrar log de conexão');
        }

        const result = await response.json();
        console.log('Log de conexão registrado:', result);
    } catch (error) {
        console.error('Erro ao registrar conexão do usuário:', error);
    }
}

// Função para registrar acesso ao bot no ranking
async function registrarAcessoBotParaRanking(botId, nomeBot) {
    try {
        const dataRanking = {
            botId: botId,
            nomeBot: nomeBot,
            timestampAcesso: new Date().toISOString()
            // usuarioId: 'pegar_id_do_usuario_se_tiver_login' // Futuramente
        };

        const response = await fetch('/api/ranking/registrar-acesso-bot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataRanking)
        });

        if (!response.ok) {
            console.error("Falha ao registrar acesso para ranking:", await response.text());
        } else {
            const result = await response.json();
            console.log("Registro de ranking:", result.message);
        }
    } catch (error) {
        console.error("Erro ao registrar acesso para ranking:", error);
    }
}

// B2.P1.A8 - Função para salvar histórico completo da sessão
async function salvarHistoricoSessao() {
    try {
        // Só salva se houver mensagens no histórico
        if (chatHistory.length === 0) {
            console.log('Nenhuma mensagem para salvar no histórico');
            return;
        }

        // Gerar dados da sessão
        const sessionData = {
            sessionId: sessionId,
            userId: null, // Pode ser expandido no futuro para usuários autenticados
            botId: "chatbot-mestre-prognosticos",
            startTime: sessionStartTime.toISOString(),
            endTime: new Date().toISOString(),
            messages: chatHistory
        };

        console.log('💾 Salvando histórico da sessão:', {
            sessionId: sessionId,
            messageCount: chatHistory.length,
            startTime: sessionStartTime,
            endTime: new Date()
        });

        const response = await fetch('/api/chat/salvar-historico', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sessionData)
        });

        if (!response.ok) {
            // Não interrompe o fluxo do chat se o salvamento falhar
            let body = '';
            try { body = await response.text(); } catch (e) { body = String(e); }
            console.error('Falha ao salvar histórico (status', response.status + '):', body);
            return null;
        }

        const result = await response.json();
        console.log('✅ Histórico salvo com sucesso:', result);
        return result;
    } catch (error) {
        console.error('❌ Erro ao salvar histórico da sessão:', error);
    }
}

// Função para adicionar mensagem ao histórico local
function adicionarMensagemAoHistorico(content, role) {
    const message = {
        role: role, // 'user' ou 'model'
        parts: [{ text: content }],
        timestamp: new Date().toISOString()
    };
    
    chatHistory.push(message);
    messageCount++;
    
    console.log(`📝 Mensagem adicionada ao histórico (${role}):`, message);
}

// Funções auxiliares
function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// Adiciona mensagem à interface
function addMessageToUI(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');

    let processedText = text;
    if (sender === 'bot') {
        processedText = processedText
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .split('\n\n')
            .map(p => `<p>${p}</p>`)
            .join('');
    }

    messageElement.innerHTML = `${processedText}<span class="message-time">${getCurrentTime()}</span>`;
    chatMessages.appendChild(messageElement);
    scrollToBottom();
}

// Indicador de digitação
function showTypingIndicator() {
    const typingElement = document.createElement('div');
    typingElement.classList.add('typing-indicator');
    typingElement.id = 'typing-indicator';
    typingElement.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    chatMessages.appendChild(typingElement);
    scrollToBottom();
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) typingIndicator.remove();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Função principal de envio de mensagem
async function sendMessage(userInput) {
    showTypingIndicator();

    // B2.P1.A8 - Adicionar mensagem do usuário ao histórico
    adicionarMensagemAoHistorico(userInput, 'user');

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: userInput,
                sessionId: sessionId
            }),
        });

        if (!response.ok) {
            // Try to extract server error details
            let bodyText = '';
            try { bodyText = await response.text(); } catch (e) { bodyText = String(e); }
            throw new Error(`HTTP ${response.status} - ${bodyText}`);
        }

        const data = await response.json();
        removeTypingIndicator();
        addMessageToUI(data.message, 'bot');
        
        // B2.P1.A8 - Adicionar resposta do bot ao histórico
        adicionarMensagemAoHistorico(data.message, 'model');
        
        // B2.P1.A8 - Salvar histórico após cada resposta do bot
        await salvarHistoricoSessao();
        
    } catch (err) {
        removeTypingIndicator();
        addMessageToUI("Erro: " + err.message, 'bot');
        console.error(err);
        
        // B2.P1.A8 - Adicionar mensagem de erro ao histórico
        adicionarMensagemAoHistorico("Erro: " + err.message, 'model');
    }

    isWaitingForResponse = false;
}

// Limpa o chat
async function clearChat() {
    try {
        // B2.P1.A8 - Salvar histórico final antes de limpar
        if (chatHistory.length > 0) {
            console.log('💾 Salvando histórico final antes de iniciar nova sessão...');
            await salvarHistoricoSessao();
        }
        
        await fetch('/api/clear-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId: sessionId }),
        });
        
        // B2.P1.A8 - Resetar variáveis da sessão
        sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        chatHistory = [];
        sessionStartTime = new Date();
        messageCount = 0;
        
        console.log('🆕 Nova sessão iniciada:', {
            sessionId: sessionId,
            startTime: sessionStartTime
        });
        
        chatMessages.innerHTML = `
            <div class="bot-message message">
                Olá! Sou o Mestre dos Prognósticos. Pronto para dominar o mundo das apostas esportivas?
                <span class="message-time">${getCurrentTime()}</span>
            </div>
        `;
        
        // B2.P1.A8 - Adicionar mensagem inicial ao novo histórico
        adicionarMensagemAoHistorico("Olá! Sou o Mestre dos Prognósticos. Pronto para dominar o mundo das apostas esportivas?", 'model');
        
    } catch (error) {
        console.error('Error clearing chat:', error);
    }
}

// Lida com envio do usuário
function handleUserMessage() {
    if (isWaitingForResponse) return;
    const userMessage = messageInput.value.trim();
    if (!userMessage) return;

    addMessageToUI(userMessage, 'user');
    // B2.P1.A8 - Não adicionar aqui, será adicionado em sendMessage()
    messageInput.value = '';
    sendButton.disabled = true;
    messageInput.focus();
    isWaitingForResponse = true;
    sendMessage(userMessage);
}

// Modal de edição de título
let modalSessionId = null;
const editTitleModal = document.getElementById('edit-title-modal');
const editTitleInput = document.getElementById('edit-title-input');
const saveTitleBtn = document.getElementById('save-title-btn');
const cancelTitleBtn = document.getElementById('cancel-title-btn');
const closeEditTitleModal = document.getElementById('close-edit-title-modal');

function openEditTitleModal(sessionId, tituloSugerido) {
    modalSessionId = sessionId;
    editTitleInput.value = tituloSugerido || '';
    editTitleModal.style.display = 'flex';
    editTitleInput.focus();
}
function closeEditTitle() {
    modalSessionId = null;
    editTitleModal.style.display = 'none';
}
if (saveTitleBtn) {
    saveTitleBtn.onclick = async function() {
        const novoTitulo = editTitleInput.value.trim();
        if (!novoTitulo) return;
        if (!modalSessionId) return;
        saveTitleBtn.disabled = true;
        try {
            const update = await fetch(`/api/chat/historicos/${modalSessionId}/atualizar-titulo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo: novoTitulo })
            });
            if (!update.ok) throw new Error('Erro ao salvar título');
            await carregarHistorico();
            closeEditTitle();
        } catch (err) {
            alert('Erro ao salvar título: ' + err.message);
        }
        saveTitleBtn.disabled = false;
    };
}
if (cancelTitleBtn) cancelTitleBtn.onclick = closeEditTitle;
if (closeEditTitleModal) closeEditTitleModal.onclick = closeEditTitle;
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && editTitleModal.style.display === 'flex') closeEditTitle();
});

// Modal de confirmação de exclusão
let deleteSessionId = null;
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const closeDeleteModal = document.getElementById('close-delete-modal');

function openDeleteModal(sessionId) {
    deleteSessionId = sessionId;
    deleteConfirmModal.style.display = 'flex';
}
function closeDelete() {
    deleteSessionId = null;
    deleteConfirmModal.style.display = 'none';
}
if (confirmDeleteBtn) {
    confirmDeleteBtn.onclick = async function() {
        if (!deleteSessionId) return;
        confirmDeleteBtn.disabled = true;
        try {
            const response = await fetch(`/api/chat/historicos/${deleteSessionId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Erro ao excluir histórico');
            await carregarHistorico();
            clearHistoryDetail();
            closeDelete();
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
        confirmDeleteBtn.disabled = false;
    };
}
if (cancelDeleteBtn) cancelDeleteBtn.onclick = closeDelete;
if (closeDeleteModal) closeDeleteModal.onclick = closeDelete;
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && deleteConfirmModal.style.display === 'flex') closeDelete();
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Input e envio de mensagens
    messageInput.addEventListener('input', () => {
        sendButton.disabled = messageInput.value.trim() === '' || isWaitingForResponse;
    });    
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !sendButton.disabled) handleUserMessage();
    });

    sendButton.addEventListener('click', handleUserMessage);
    if (clearButton) clearButton.addEventListener('click', clearChat);
    if (newChatButton) newChatButton.addEventListener('click', clearChat);

    // Event listeners para o histórico
    if (historyButton) {
        historyButton.addEventListener('click', toggleHistoryPanel);
    }
    if (closeHistoryButton) {
        closeHistoryButton.addEventListener('click', () => historyPanel.classList.remove('open'));
    }
    if (refreshHistoryButton) {
        refreshHistoryButton.addEventListener('click', carregarHistorico);
    }    clearChat();
    registrarConexaoUsuario();
    registrarAcessoBotParaRanking("chatbot-mestre-prognosticos", "Mestre dos Prognósticos - Chatbot de Apostas Esportivas");

    // Delegação de eventos para botões do histórico (garantido após DOM pronto)
    if (historyList) {
        historyList.addEventListener('click', async function(e) {
            const item = e.target.closest('.history-item');
            if (!item) return;
            const sessionId = item.getAttribute('data-session-id');

            // Botão Excluir
            if (e.target.matches('button[data-action="excluir"]')) {
                e.preventDefault();
                e.stopPropagation();
                openDeleteModal(sessionId);
                return;
            }

            // Botão Gerar Título
            if (e.target.matches('button[data-action="gerar-titulo"]')) {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const btn = e.target;
                    btn.disabled = true;
                    btn.textContent = '...';
                    const response = await fetch(`/api/chat/historicos/${sessionId}/gerar-titulo`);
                    if (!response.ok) throw new Error('Erro ao gerar título');
                    const data = await response.json();
                    openEditTitleModal(sessionId, data.tituloSugerido);
                    btn.disabled = false;
                    btn.textContent = '✨';
                } catch (err) {
                    alert('Erro ao gerar título: ' + err.message);
                    e.target.disabled = false;
                    e.target.textContent = '✨';
                }
                return;
            }

            // Clique no item (exceto botões): mostrar detalhes
            if (!e.target.closest('button')) {
                selecionarSessao(sessionId);
            }
        });
    }
    
    // Modal Sobre o Autor
    const openAboutBtn = document.getElementById('open-about');
    const aboutModal = document.getElementById('about-modal');
    const closeAboutModal = document.getElementById('close-about-modal');
    if (openAboutBtn && aboutModal) {
        openAboutBtn.addEventListener('click', () => {
            aboutModal.style.display = 'flex';
            aboutModal.classList.add('show');
        });
    }
    if (closeAboutModal && aboutModal) {
        closeAboutModal.addEventListener('click', () => {
            aboutModal.style.display = 'none';
            aboutModal.classList.remove('show');
        });
    }
    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && aboutModal && (aboutModal.style.display === 'flex' || aboutModal.classList.contains('show'))) {
            aboutModal.style.display = 'none';
            aboutModal.classList.remove('show');
        }
    });
});

// =============== FUNCIONALIDADES DE HISTÓRICO ===============

// Função para alternar o painel de histórico
function toggleHistoryPanel() {
    if (historyPanel.classList.contains('open')) {
        closeHistoryPanel();
    } else {
        openHistoryPanel();
    }
}

// Função para abrir o painel de histórico
function openHistoryPanel() {
    historyPanel.classList.add('open');
    loadHistoryList(); // Carregar lista ao abrir
}

// Função para fechar o painel de histórico
function closeHistoryPanel() {
    historyPanel.classList.remove('open');
    currentSelectedSession = null;
    clearHistoryDetail();
}

// Função para carregar lista de históricos
async function loadHistoryList() {
    try {
        console.log('📚 Carregando lista de históricos...');
        
        // Mostrar indicador de carregamento
        historyList.innerHTML = '<div class="loading-message">Carregando histórico...</div>';
        
        const response = await fetch('/api/chat/historicos?limit=20&sortBy=startTime&order=desc');
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('✅ Históricos carregados:', data);
        
        historyData = data.sessions || [];
        renderHistoryList(historyData);
        
    } catch (error) {
        console.error('❌ Erro ao carregar históricos:', error);
        historyList.innerHTML = '<div class="error-message">Erro ao carregar histórico: ' + error.message + '</div>';
    }
}

// Função para renderizar a lista de históricos
function renderHistoryList(sessions) {
    if (!sessions || sessions.length === 0) {
        historyList.innerHTML = '<div class="loading-message">Nenhum histórico encontrado</div>';
        return;
    }
    
    const historyHTML = sessions.map(session => {
        const startDate = new Date(session.startTime);
        const formattedDate = startDate.toLocaleDateString('pt-BR');
        const formattedTime = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const duration = formatDuration(session.duration);
        
        return `
            <div class="history-item ${currentSelectedSession === session.sessionId ? 'selected' : ''}" 
                 data-session-id="${session.sessionId}">
                <div class="history-item-header">
                    <div class="history-item-title">
                        ${session.titulo || `Conversa ${session.sessionId.substring(0, 8)}...`}
                    </div>
                    <div class="history-item-actions">
                        <button class="title-button" data-action="gerar-titulo" title="Gerar título" type="button">
                            ✨
                        </button>
                        <button class="delete-button" data-action="excluir" title="Excluir conversa" type="button">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="history-item-preview" onclick="selectHistorySession('${session.sessionId}')">
                    ${session.preview}
                </div>
                <div class="history-item-stats">
                    <span>⏰ ${formattedTime}</span>
                    <span>💬 ${session.messageCount} msgs</span>
                    <span>⏱️ ${duration}</span>
                </div>
            </div>
        `;
    }).join('');
    
    historyList.innerHTML = historyHTML;
}

// Função para formatar duração em segundos
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

// Função para selecionar uma sessão de histórico
async function selectHistorySession(sessionId) {
    try {
        console.log(`📖 Selecionando sessão: ${sessionId}`);
        
        // Marcar item como selecionado
        document.querySelectorAll('.history-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`[data-session-id="${sessionId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        currentSelectedSession = sessionId;
        
        // Mostrar indicador de carregamento
        historyDetailContent.innerHTML = '<div class="loading-message">Carregando conversa...</div>';
        
        // Buscar detalhes da sessão
        const response = await fetch(`/api/chat/historicos/${sessionId}`);
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('✅ Detalhes da sessão carregados:', data);
        
        if (data.success && data.session) {
            renderSessionDetail(data.session);
        } else {
            throw new Error('Sessão não encontrada');
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar sessão:', error);
        historyDetailContent.innerHTML = '<div class="error-message">Erro ao carregar conversa: ' + error.message + '</div>';
    }
}

// Função para renderizar detalhes de uma sessão
function renderSessionDetail(session) {
    const startDate = new Date(session.startTime);
    const endDate = new Date(session.endTime);
    const duration = Math.round((endDate - startDate) / 1000);
    
    const sessionInfoHTML = `
        <div class="session-info">
            <h5>📊 Informações da Sessão</h5>
            <div class="session-info-grid">
                <div class="session-info-item">
                    <span>ID da Sessão:</span>
                    <span>${session.sessionId}</span>
                </div>
                <div class="session-info-item">
                    <span>Bot:</span>
                    <span>${session.botId}</span>
                </div>
                <div class="session-info-item">
                    <span>Início:</span>
                    <span>${startDate.toLocaleString('pt-BR')}</span>
                </div>
                <div class="session-info-item">
                    <span>Fim:</span>
                    <span>${endDate.toLocaleString('pt-BR')}</span>
                </div>
                <div class="session-info-item">
                    <span>Duração:</span>
                    <span>${formatDuration(duration)}</span>
                </div>
                <div class="session-info-item">
                    <span>Mensagens:</span>
                    <span>${session.messages ? session.messages.length : 0}</span>
                </div>
            </div>
        </div>
    `;
    
    const messagesHTML = session.messages && session.messages.length > 0 
        ? renderHistoryMessages(session.messages)
        : '<div class="no-selection">Nenhuma mensagem encontrada nesta sessão</div>';
    
    historyDetailContent.innerHTML = sessionInfoHTML + '<div class="conversation-messages">' + messagesHTML + '</div>';
}

// Função para renderizar mensagens do histórico
function renderHistoryMessages(messages) {
    return messages.map(message => {
        const timestamp = new Date(message.timestamp);
        const formattedTime = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const text = message.parts && message.parts[0] ? message.parts[0].text : 'Mensagem sem conteúdo';
        const role = message.role;
        
        // Processar texto se for do bot (mesmo processamento do chat principal)
        let processedText = text;
        if (role === 'model') {
            processedText = processedText
                .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
                .split('\n\n')
                .map(p => `<p>${p}</p>`)
                .join('');
        }
        
        return `
            <div class="history-message ${role === 'user' ? 'user' : 'bot'}">
                ${processedText}
                <span class="history-message-time">${formattedTime}</span>
            </div>
        `;
    }).join('');
}

// Funções de manipulação do histórico
function clearHistoryDetail() {
    historyDetailContent.innerHTML = '<div class="no-selection">Selecione uma conversa para ver os detalhes</div>';
}

async function selecionarSessao(sessionId) {
    try {
        console.log(`📖 Carregando detalhes da sessão: ${sessionId}`);
        currentSelectedSession = sessionId;
        
        // Atualizar visual da seleção
        document.querySelectorAll('.history-item').forEach(item => {
            if (item.dataset.sessionId === sessionId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        // Mostrar loading
        historyDetailContent.innerHTML = '<div class="loading-message">Carregando conversa...</div>';
        
        const response = await fetch(`/api/chat/historicos/${sessionId}`);
        
        if (!response.ok) {
            throw new Error(`Erro ao carregar conversa: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.session) {
            throw new Error('Conversa não encontrada');
        }
        
        const session = data.session;
        
        // Renderizar detalhes
        historyDetailContent.innerHTML = `
            <div class="session-info">
                <h5>${session.titulo || 'Conversa Sem Título'}</h5>
                <div class="session-info-grid">
                    <div class="session-info-item">
                        <span>Início:</span>
                        <span>${new Date(session.startTime).toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="session-info-item">
                        <span>Duração:</span>
                        <span>${formatDuration(
                            Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)
                        )}</span>
                    </div>
                    <div class="session-info-item">
                        <span>Mensagens:</span>
                        <span>${session.messages.length}</span>
                    </div>
                </div>
            </div>
            <div class="conversation-messages">
                ${session.messages.map(msg => `
                    <div class="history-message ${msg.role === 'user' ? 'user' : 'bot'}">
                        ${msg.parts[0].text}
                        <span class="history-message-time">
                            ${new Date(msg.timestamp).toLocaleTimeString('pt-BR')}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('❌ Erro ao carregar conversa:', error);
        historyDetailContent.innerHTML = `
            <div class="error-message">
                Erro ao carregar conversa: ${error.message}
            </div>
        `;
    }
}

// Função para excluir histórico
async function excluirHistorico(sessionId, event) {
    // Prevenir que o clique no botão selecione a conversa
    event.stopPropagation();
    
    if (!confirm('Tem certeza que deseja excluir esta conversa?')) {
        return;
    }
    
    try {
        console.log('🗑️ Excluindo histórico:', sessionId);
        
        const response = await fetch(`/api/chat/historicos/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Histórico excluído com sucesso');
            
            // Atualizar lista
            await loadHistoryList();
            
            // Limpar detalhes se a sessão excluída era a selecionada
            if (currentSelectedSession === sessionId) {
                currentSelectedSession = null;
                clearHistoryDetail();
            }
        } else {
            throw new Error(data.error || 'Erro ao excluir histórico');
        }
    } catch (error) {
        console.error('❌ Erro ao excluir histórico:', error);
        alert('Erro ao excluir histórico: ' + error.message);
    }
}

// Função para gerar título sugerido
async function gerarTituloSugestao(sessionId, event) {
    // Prevenir que o clique no botão selecione a conversa
    event.stopPropagation();
    
    try {
        console.log('✨ Gerando título para sessão:', sessionId);
        
        // Mostrar loading
        const titleElement = document.querySelector(`[data-session-id="${sessionId}"] .history-item-title`);
        const originalTitle = titleElement.textContent;
        titleElement.textContent = 'Gerando título...';
        
        const response = await fetch(`/api/chat/historicos/${sessionId}/gerar-titulo`);
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Título sugerido:', data.tituloSugerido);
            
            // Solicitar edição do título
            const novoTitulo = prompt('Edite o título sugerido:', data.tituloSugerido);
            
            if (novoTitulo) {
                // Salvar novo título
                const updateResponse = await fetch(`/api/chat/historicos/${sessionId}/atualizar-titulo`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ titulo: novoTitulo })
                });
                
                if (!updateResponse.ok) {
                    throw new Error('Erro ao salvar novo título');
                }
                
                const updateData = await updateResponse.json();
                
                if (updateData.success) {
                    console.log('✅ Título atualizado com sucesso');
                    titleElement.textContent = novoTitulo;
                } else {
                    throw new Error(updateData.error || 'Erro ao salvar título');
                }
            } else {
                // Usuário cancelou, restaurar título original
                titleElement.textContent = originalTitle;
            }
        } else {
            throw new Error(data.error || 'Erro ao gerar título');
        }
    } catch (error) {
        console.error('❌ Erro ao gerar/atualizar título:', error);
        alert('Erro ao gerar/atualizar título: ' + error.message);
        
        // Restaurar título original em caso de erro
        const titleElement = document.querySelector(`[data-session-id="${sessionId}"] .history-item-title`);
        if (titleElement) {
            titleElement.textContent = originalTitle || `Conversa ${sessionId.substring(0, 8)}...`;
        }
    }
}

// Exemplo de ajuste de placeholder e título para estética de apostas

document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.placeholder = 'Digite sua aposta, palpite ou dúvida...';
    }
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.title = 'Enviar aposta';
    }
    // Ajusta título do histórico
    const historyHeader = document.querySelector('.history-header h3');
    if (historyHeader) {
        historyHeader.textContent = 'Histórico de Apostas';
    }
    
    // Botão de reiniciar chat
    const resetBtn = document.getElementById('reset-chat');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                chatMessages.innerHTML = `<div class="bot-message message">
                    Olá! Sou o Mestre dos Prognósticos. Pronto para dominar o mundo das apostas esportivas?
                    <span class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>`;
            }
        });
    }
    // Botão de configurações (pode abrir um modal futuramente)
    const settingsBtn = document.getElementById('open-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            alert('Em breve: configurações personalizadas para suas apostas!');
        });
    }
    // Botão de abrir histórico (garante funcionamento)
    const openHistoryBtn = document.getElementById('open-history');
    if (openHistoryBtn) {
        openHistoryBtn.addEventListener('click', toggleHistoryPanel);
    }
    const openAdminBtn = document.getElementById('open-admin');
    const openAdminSecondaryBtn = document.getElementById('open-admin-secondary');
    function handleOpenAdmin() {
        // Acesse diretamente o painel admin; login será feito lá
        window.location.href = '/admin';
    }
    if (openAdminBtn) openAdminBtn.addEventListener('click', handleOpenAdmin);
    if (openAdminSecondaryBtn) openAdminSecondaryBtn.addEventListener('click', handleOpenAdmin);
});

// =============== FUNCIONALIDADES DE LOGIN ===============

let currentUser = null;

function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('login-form').reset();
    document.getElementById('login-error').textContent = '';
}

function hideLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = '';
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
            const data = await res.json();
            errorDiv.textContent = data.error || 'Usuário ou senha inválidos.';
            return;
        }
        const data = await res.json();
        currentUser = data.user; // { userId, username, isAdmin }
        hideLoginModal();
    // Redireciona para o painel admin
    window.location.href = '/admin';
    } catch (err) {
        errorDiv.textContent = 'Erro de conexão. Tente novamente.';
    }
}

function enableChatUI() {
    document.getElementById('chat-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    // ...habilite outros elementos se necessário...
}

function disableChatUI() {
    document.getElementById('chat-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    // ...desabilite outros elementos se necessário...
}


// Botões de acesso ao painel admin já redirecionam diretamente em handleOpenAdmin

// Modifique loadHistoricos para enviar userId se necessário
async function loadHistoricos() {
    if (!currentUser) return;
    let url = '/api/chat/historicos';
    if (!currentUser.isAdmin) {
        url += `?userId=${encodeURIComponent(currentUser.userId)}`;
    }
    const res = await fetch(url);
    // ...restante da função...
}
