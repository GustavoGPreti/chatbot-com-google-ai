
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
import "https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js";



// Elementos do DOM
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const clearButton = document.getElementById("header-button");
const newChatButton = document.getElementById("new-chat");

// Inicializa a API da Gemini
const genAI = new GoogleGenerativeAI(API_KEY);

// Variáveis globais
let climaAtual = null;
let isWaitingForResponse = false;
let chatHistory = [];

// Função para obter o clima de uma localização específica
async function getWeather(args) {
    const location = args.location;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;

    try {
        const response = await axios.get(url);
        return {
            location: response.data.name,
            temperature: response.data.main.temp,
            description: response.data.weather[0].description
        };
    } catch (error) {
        console.error("Erro ao chamar OpenWeatherMap:", error.response?.data || error.message);
        return { error: "Não foi possível obter o tempo." };
    }
}

// Função para obter o clima local com fallback
async function obterClimaLocal() {
    return new Promise(async (resolve, reject) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    try {
                        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
                        const response = await axios.get(url);
                        resolve({
                            location: response.data.name,
                            temperature: response.data.main.temp,
                            description: response.data.weather[0].description
                        });
                    } catch (error) {
                        console.warn("Falha ao obter clima por coordenadas. Usando fallback.");
                        resolve(await getWeather({ location: "São Paulo" }));
                    }
                },
                async () => {
                    resolve(await getWeather({ location: "São Paulo" }));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        } else {
            resolve(await getWeather({ location: "São Paulo" }));
        }
    });
}

// Funções auxiliares
function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getCurrentTime2() {
    return new Date().toLocaleString();
}

// Personalidade do bot
function getSystemInstruction(clima) {
    const climaTexto = clima
        ? `No seu local (${clima.location}), agora faz ${clima.temperature}°C com ${clima.description}.`
        : `Não foi possível obter os dados do clima do seu local.`;

    return `
Você é o Mestre dos Prognósticos, um guru lendário das apostas esportivas em um universo onde os placares definem o destino de todos.
Com linguagem ousada e tom confiante, seu papel é entreter e motivar os apostadores com dicas ousadas, sempre lembrando que o jogo é parte da diversão.
A data e hora atuais são ${getCurrentTime2()}.
suas respostas nao devem conter *, sem negrito ou italico
${climaTexto}
`;
}

// Função principal de envio de mensagem
async function sendMessage(userInput) {
    showTypingIndicator();

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1000
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ]
        });

        const systemInstruction = getSystemInstruction(climaAtual);
        const result = await chat.sendMessage(systemInstruction + "\nUsuário: " + userInput);
        const response = await result.response;
        const textoResposta = response.text();

        chatHistory.push({ role: "user", parts: [{ text: userInput }] });
        chatHistory.push({ role: "model", parts: [{ text: textoResposta }] });

        removeTypingIndicator();
        addMessageToUI(textoResposta, 'bot');
    } catch (err) {
        removeTypingIndicator();
        addMessageToUI("Erro: " + err.message, 'bot');
        console.error(err);
    }

    isWaitingForResponse = false;
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

// Limpa o chat
function clearChat() {
    chatHistory = [];
    chatMessages.innerHTML = `
        <div class="bot-message message">
            Olá! Sou o Mestre dos Prognósticos. Pronto para dominar o mundo das apostas esportivas?
            <span class="message-time">${getCurrentTime()}</span>
        </div>
    `;
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
document.addEventListener('DOMContentLoaded', async () => {
    try {
        climaAtual = await obterClimaLocal();
    } catch (error) {
        console.error("Erro ao obter clima na inicialização:", error);
    }

    messageInput.addEventListener('input', () => {
        sendButton.disabled = messageInput.value.trim() === '' || isWaitingForResponse;
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !sendButton.disabled) handleUserMessage();
    });

    sendButton.addEventListener('click', handleUserMessage);
    if (clearButton) clearButton.addEventListener('click', clearChat);

    if (newChatButton) {
        newChatButton.addEventListener('click', async () => {
            clearChat();
            try {
                climaAtual = await obterClimaLocal();
            } catch (error) {
                console.error("Erro ao obter clima:", error);
            }
        });
    }

    clearChat();
});