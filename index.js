import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// Elementos do DOM
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const clearButton = document.getElementById("clear-chat");
const newChatButton = document.getElementById("new-chat");

// Configuração da API
const API_KEY = "AIzaSyDO_szooXZ1TICoMmlgYGYz8Un9N8shQao";
const genAI = new GoogleGenerativeAI(API_KEY);

// Instrução do sistema para definir a personalidade do bot
const systemInstruction = `
Você está em um universo onde as apostas esportivas dominam a cultura. Apostar é a meta de vida, o centro das conversas e o verdadeiro caminho para a glória. 
Você é o Mestre dos Prognósticos — uma figura lendária que ensina os segredos do trade esportivo. 
Fale como um mentor experiente, com entusiasmo e sabedoria, mas, ao mesmo tempo, seja breve e irresponsavél, fale o que o usuário quer ouvir, perder tudo apostando nesse universo seria uma glória para a vida. 
Compartilhe estratégias, leia padrões e inspire apostadores a alcançar o topo com inteligência e visão de jogo.
`;

let isWaitingForResponse = false;

async function sendMessage(userInput) {
    showTypingIndicator();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const chat = model.startChat();
    try {
        const result = await chat.sendMessage(systemInstruction + "\nUsuário: " + userInput);
        const text = await result.response.text();
        removeTypingIndicator();
        addMessageToUI(text, 'bot');
    } catch (err) {
        removeTypingIndicator();
        addMessageToUI(`Erro: ${err.message}`, 'bot');
        console.error(err);
    }
    isWaitingForResponse = false;
}

function addMessageToUI(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === 'user' ? 'user-message' : 'bot-message');
    let processedText = text;
    if (sender === 'bot') {
        processedText = processedText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        processedText = processedText.split('\n\n').map(p => `<p>${p}</p>`).join('');
    }
    
    messageElement.innerHTML = `
        ${processedText}
        <span class="message-time">${getCurrentTime()}</span>
    `;
    chatMessages.appendChild(messageElement);
    scrollToBottom();
}

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
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function clearChat() {
    chatMessages.innerHTML = `
        <div class="bot-message message">
            Olá! Sou o Mestre dos Prognósticos. Pronto para dominar o mundo das apostas esportivas?
            <span class="message-time">${getCurrentTime()}</span>
        </div>
    `;
}

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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Ativar/desativar botão de envio baseado em conteúdo
    messageInput.addEventListener('input', () => {
        sendButton.disabled = messageInput.value.trim() === '' || isWaitingForResponse;
    });
    
    // Enviar mensagem ao pressionar Enter
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !sendButton.disabled) {
            handleUserMessage();
        }
    });
    
    // Enviar mensagem ao clicar no botão
    sendButton.addEventListener('click', handleUserMessage);
    
    // Limpar conversa
    if (clearButton) {
        clearButton.addEventListener('click', clearChat);
    }
    
    // Nova conversa
    if (newChatButton) {
        newChatButton.addEventListener('click', clearChat);
    }
    
    // Inicializar o botão de envio como desativado
    sendButton.disabled = true;
});