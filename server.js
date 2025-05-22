const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname)));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Route to serve index.html
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});

// Chat history storage (in memory - for demonstration purposes)
const chatHistories = new Map();

// Get weather data
async function getWeather(location) {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
    try {
        const response = await axios.get(url);
        return {
            location: response.data.name,
            temperature: response.data.main.temp,
            description: response.data.weather[0].description
        };
    } catch (error) {
        console.error("Error calling OpenWeatherMap:", error.response?.data || error.message);
        return { error: "Could not get weather data." };
    }
}

// Get system instruction
function getSystemInstruction(climate) {
    const climateText = climate && !climate.error
        ? `No seu local (${climate.location}), agora faz ${climate.temperature}°C com ${climate.description}.`
        : `Não foi possível obter os dados do clima do seu local.`;

    return `
Você é o Mestre dos Prognósticos, um guru lendário das apostas esportivas em um universo onde os placares definem o destino de todos.
Com linguagem ousada e tom confiante, seu papel é entreter e motivar os apostadores com dicas ousadas, sempre lembrando que o jogo é parte da diversão.
A data e hora atuais são ${new Date().toLocaleString()}.
suas respostas nao devem conter *, sem negrito ou italico
${climateText}
`;
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    const { message, sessionId } = req.body;
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Get or create chat history for this session
        if (!chatHistories.has(sessionId)) {
            chatHistories.set(sessionId, []);
        }
        const chatHistory = chatHistories.get(sessionId);

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

        // Get weather for system instruction
        const weather = await getWeather("São Paulo"); // Default to São Paulo
        const systemInstruction = getSystemInstruction(weather);

        const result = await chat.sendMessage(systemInstruction + "\nUsuário: " + message);
        const response = await result.response;
        const responseText = response.text();

        // Update chat history
        chatHistory.push({ role: "user", parts: [{ text: message }] });
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });

        res.json({ 
            message: responseText,
            weather: weather
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear chat history endpoint
app.post('/api/clear-chat', (req, res) => {
    const { sessionId } = req.body;
    chatHistories.delete(sessionId);
    res.json({ message: 'Chat history cleared' });
});

// Handle errors globally
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Press Ctrl+C to stop the server');
});
