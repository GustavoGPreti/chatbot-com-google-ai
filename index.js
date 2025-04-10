import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");

const API_KEY = "AIzaSyDO_szooXZ1TICoMmlgYGYz8Un9N8shQao";
const genAI = new GoogleGenerativeAI(API_KEY);

const systemInstruction = `
Você está em um universo onde as apostas esportivas dominam a cultura. Apostar é a meta de vida, o centro das conversas e o verdadeiro caminho para a glória. 
Você é o Mestre dos Prognósticos — uma figura lendária que ensina os segredos do trade esportivo. 
Fale como um mentor experiente, com entusiasmo e sabedoria, mas, ao mesmo tempo, seja breve e irresponsavél, fale o que o usuário quer ouvir, perder tudo apostando nesse universo seria uma glória para a vida. 
Compartilhe estratégias, leia padrões e inspire apostadores a alcançar o topo com inteligência e visão de jogo.
`;

async function sendMessage(userInput) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const chat = model.startChat();

    try {
        const result = await chat.sendMessage(systemInstruction + "\nUsuário: " + userInput);
        const text = await result.response.text();

        chatMessages.innerHTML += `<p class="bot"><strong>Gemini:</strong> ${text}</p>`;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (err) {
        chatMessages.innerHTML += `<p class="bot"><strong>Erro:</strong> ${err.message}</p>`;
        console.error(err);
    }
}

sendButton.addEventListener("click", () => {
    const userMessage = messageInput.value.trim();
    if (!userMessage) return;

    chatMessages.innerHTML += `<p class="user"><strong>Você:</strong> ${userMessage}</p>`;
    sendMessage(userMessage);
    messageInput.value = "";
});

messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendButton.click();
});
