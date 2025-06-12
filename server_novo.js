const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout após 5 segundos
    socketTimeoutMS: 45000, // Timeout do socket
})
.then(() => {
    console.log('Conectado ao MongoDB Atlas!');
})
.catch((error) => {
    console.error('MongoDB connection error:', error.message);
    console.log('Continuando sem MongoDB - logs serão salvos localmente');
});

// Middleware para verificar status do MongoDB
function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json());

// Log middleware para debug
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chat history storage (in memory - for demonstration purposes)
const chatHistories = new Map();

// Array para simular dados de ranking (em memória)
let dadosRankingVitrine = [];

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

// Log connection endpoint
app.post('/api/log-connection', async (req, res) => {
    try {
        const { ip, acao } = req.body;

        if (!ip || !acao) {
            return res.status(400).json({ error: "Dados de log incompletos (IP e ação são obrigatórios)." });
        }

        const agora = new Date();
        const dataFormatada = agora.toISOString().split('T')[0]; // YYYY-MM-DD
        const horaFormatada = agora.toTimeString().split(' ')[0]; // HH:MM:SS

        const logEntry = {
            col_data: dataFormatada,
            col_hora: horaFormatada,
            col_IP: ip,
            col_nome_bot: "Chatbot de Apostas Esportivas",
            col_acao: acao
        };

        // Verifica se o MongoDB está conectado
        if (isMongoConnected()) {
            try {
                const db = mongoose.connection.db;
                const collection = db.collection("tb_cl_user_log_acess");
                
                const result = await collection.insertOne(logEntry);
                
                res.json({ 
                    success: true, 
                    message: 'Log registrado com sucesso no MongoDB',
                    insertedId: result.insertedId 
                });
            } catch (dbError) {
                console.error('Erro ao salvar no MongoDB:', dbError.message);
                console.log('Salvando log localmente:', logEntry);
                res.json({ 
                    success: true, 
                    message: 'Log registrado localmente (erro no MongoDB)',
                    data: logEntry 
                });
            }
        } else {
            // Log local se MongoDB não estiver disponível
            console.log('Log registrado localmente (MongoDB indisponível):', logEntry);
            res.json({ 
                success: true, 
                message: 'Log registrado localmente (MongoDB indisponível)',
                data: logEntry 
            });
        }
    } catch (error) {
        console.error('Erro ao registrar log de conexão:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao registrar log' });
    }
});

// User info endpoint (para obter IP do cliente)
app.get('/api/user-info', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null);
    
    res.json({ ip: ip });
});

// Status endpoint para verificar MongoDB
app.get('/api/status', (req, res) => {
    res.json({
        server: 'online',
        mongodb: isMongoConnected() ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown'
    });
});

// Endpoint para registrar acesso do bot no ranking
app.post('/api/ranking/registrar-acesso-bot', (req, res) => {
    try {
        const { botId, nomeBot, timestampAcesso, usuarioId } = req.body;

        if (!botId || !nomeBot) {
            return res.status(400).json({ error: "botId e nomeBot são obrigatórios" });
        }

        // Procura se o bot já existe no ranking
        const botExistente = dadosRankingVitrine.find(bot => bot.botId === botId);

        if (botExistente) {
            // Incrementa o contador de acessos
            botExistente.contagem += 1;
            botExistente.ultimoAcesso = timestampAcesso ? new Date(timestampAcesso) : new Date();
        } else {
            // Adiciona novo bot ao ranking
            dadosRankingVitrine.push({
                botId: botId,
                nomeBot: nomeBot,
                contagem: 1,
                ultimoAcesso: timestampAcesso ? new Date(timestampAcesso) : new Date()
            });
        }

        // Ordena por contagem (decrescente)
        dadosRankingVitrine.sort((a, b) => b.contagem - a.contagem);

        console.log('[Servidor] Dados de ranking atualizados:', dadosRankingVitrine);

        res.status(201).json({ 
            message: `Acesso ao bot ${nomeBot} registrado para ranking.`,
            ranking: dadosRankingVitrine 
        });
    } catch (error) {
        console.error('Erro ao registrar acesso no ranking:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Endpoint para visualizar o ranking
app.get('/api/ranking/visualizar', (req, res) => {
    try {
        // Ordenar por contagem, do maior para o menor
        const rankingOrdenado = [...dadosRankingVitrine].sort((a, b) => b.contagem - a.contagem);
        res.json(rankingOrdenado);
    } catch (error) {
        console.error('Erro ao obter ranking:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
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
