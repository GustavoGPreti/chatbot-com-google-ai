// Elementos do DOM
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const clearButton = document.getElementById("header-button");
const newChatButton = document.getElementById("new-chat");

// Variáveis globais
let isWaitingForResponse = false;
let sessionId = Date.now().toString(); // Identificador único para cada sessão de chat

// B2.P1.A8 - Variáveis para histórico de sessão
let chatHistory = []; // Histórico completo da sessão
let sessionStartTime = new Date(); // Início da sessão
let messageCount = 0; // Contador de mensagens

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
    });    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !sendButton.disabled) handleUserMessage();
    });

    sendButton.addEventListener('click', handleUserMessage);
    if (clearButton) clearButton.addEventListener('click', clearChat);
    if (newChatButton) newChatButton.addEventListener('click', clearChat);

    clearChat();
    registrarConexaoUsuario();
    registrarAcessoBotParaRanking("chatbot-mestre-prognosticos", "Mestre dos Prognósticos - Chatbot de Apostas Esportivas");
});
