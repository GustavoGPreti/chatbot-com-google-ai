// Elementos do DOM
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const clearButton = document.getElementById("header-button");
const newChatButton = document.getElementById("new-chat");

// Variáveis globais
let isWaitingForResponse = false;
let sessionId = Date.now().toString(); // Identificador único para cada sessão de chat

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
    } catch (err) {
        removeTypingIndicator();
        addMessageToUI("Erro: " + err.message, 'bot');
        console.error(err);
    }

    isWaitingForResponse = false;
}

// Limpa o chat
async function clearChat() {
    try {
        await fetch('/api/clear-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId: sessionId }),
        });
        
        // Gera um novo ID de sessão
        sessionId = Date.now().toString();
        
        chatMessages.innerHTML = `
            <div class="bot-message message">
                Olá! Sou o Mestre dos Prognósticos. Pronto para dominar o mundo das apostas esportivas?
                <span class="message-time">${getCurrentTime()}</span>
            </div>
        `;
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
    registrarAcessoBotParaRanking("chatbot-mestre-prognosticos", "Mestre dos Prognósticos - IFCODE");
});
