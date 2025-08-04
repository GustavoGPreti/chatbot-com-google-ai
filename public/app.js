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
            throw new Error(`Erro HTTP: ${response.status}`);
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
            throw new Error('Network response was not ok');
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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
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
    if (historyButton) historyButton.addEventListener('click', toggleHistoryPanel);
    if (closeHistoryButton) closeHistoryButton.addEventListener('click', closeHistoryPanel);
    if (refreshHistoryButton) refreshHistoryButton.addEventListener('click', loadHistoryList);

    clearChat();
    registrarConexaoUsuario();
    registrarAcessoBotParaRanking("chatbot-mestre-prognosticos", "Mestre dos Prognósticos - Chatbot de Apostas Esportivas");
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
            <div class="history-item" data-session-id="${session.sessionId}" onclick="selectHistorySession('${session.sessionId}')">
                <div class="history-item-header">
                    <div class="history-item-title">Conversa ${session.sessionId.substring(0, 8)}...</div>
                    <div class="history-item-date">${formattedDate}</div>
                </div>
                <div class="history-item-preview">${session.preview}</div>
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

// Função para limpar detalhes do histórico
function clearHistoryDetail() {
    historyDetailContent.innerHTML = '<div class="no-selection">Selecione uma conversa para ver os detalhes</div>';
}
