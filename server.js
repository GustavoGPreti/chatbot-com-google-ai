const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Múltiplas conexões MongoDB
let dbLogs = null; // DB compartilhado para logs simples
let dbHistoria = null; // DB individual para histórico de sessões

// Função genérica para conectar ao MongoDB
async function connectToMongoDB(uri, dbName) {
    try {
        const client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        await client.connect();
        console.log(`✅ Conectado ao MongoDB: ${dbName}`);
        return client.db(dbName);
    } catch (error) {
        console.error(`❌ Erro ao conectar ao MongoDB ${dbName}:`, error.message);
        return null;
    }
}

// Inicializar conexões
async function initializeDatabases() {
    // Conexão para logs (DB compartilhado)
    if (process.env.MONGO_URI_LOGS) {
        dbLogs = await connectToMongoDB(process.env.MONGO_URI_LOGS, 'IIW2023A_Logs');
    }
    
    // Conexão para histórico de sessões (DB individual)
    if (process.env.MONGO_URI_HISTORIA) {
        dbHistoria = await connectToMongoDB(process.env.MONGO_URI_HISTORIA, 'HistoricoChats');
    }
    
    console.log('🚀 Inicialização das conexões MongoDB concluída');
}

// Inicializar conexões na inicialização do servidor
initializeDatabases();

// MongoDB Connection (mantido para compatibilidade)
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI_LOGS, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ Mongoose conectado ao MongoDB Atlas!');
})
.catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️ Continuando sem MongoDB - logs serão salvos localmente');
});

// Middleware para verificar status do MongoDB
function isMongoConnected() {
    return mongoose.connection.readyState === 1 || dbLogs !== null;
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

// NOVO ENDPOINT B2.P1.A8 - Salvar histórico completo de sessão
app.post('/api/chat/salvar-historico', async (req, res) => {
    try {
        const { sessionId, userId, botId, messages, startTime, endTime } = req.body;

        // Validação dos dados obrigatórios
        if (!sessionId || !botId || !messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                error: "Dados incompletos. sessionId, botId e messages (array) são obrigatórios." 
            });
        }

        if (messages.length === 0) {
            return res.status(400).json({ 
                error: "O array de messages não pode estar vazio." 
            });
        }

        // Estrutura dos dados para salvar
        const sessionData = {
            sessionId: sessionId,
            userId: userId || null,
            botId: botId,
            startTime: startTime ? new Date(startTime) : new Date(),
            endTime: endTime ? new Date(endTime) : new Date(),
            messages: messages,
            loggedAt: new Date()
        };

        // Tentar salvar no MongoDB individual
        if (dbHistoria) {
            try {
                const collection = dbHistoria.collection("sessoesChat");
                const result = await collection.insertOne(sessionData);
                
                console.log('✅ Histórico de sessão salvo no MongoDB:', {
                    sessionId: sessionId,
                    botId: botId,
                    messagesCount: messages.length,
                    insertedId: result.insertedId
                });

                res.json({
                    success: true,
                    message: 'Histórico de sessão salvo com sucesso no MongoDB',
                    sessionId: sessionId,
                    insertedId: result.insertedId,
                    messagesCount: messages.length,
                    storage: 'mongodb_individual'
                });
            } catch (dbError) {
                console.error('❌ Erro ao salvar histórico no MongoDB:', dbError.message);
                
                // Fallback: salvar localmente
                const fs = require('fs');
                const logsDir = path.join(__dirname, 'logs');
                const historicFile = path.join(logsDir, 'historic_sessions.json');
                
                try {
                    if (!fs.existsSync(logsDir)) {
                        fs.mkdirSync(logsDir, { recursive: true });
                    }
                    
                    let sessions = [];
                    if (fs.existsSync(historicFile)) {
                        sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                    }
                    
                    sessions.push(sessionData);
                    
                    // Manter apenas as últimas 100 sessões
                    if (sessions.length > 100) {
                        sessions.splice(0, sessions.length - 100);
                    }
                    
                    fs.writeFileSync(historicFile, JSON.stringify(sessions, null, 2));
                    
                    console.log('📁 Histórico salvo localmente como fallback');
                    
                    res.json({
                        success: true,
                        message: 'Histórico salvo localmente (fallback)',
                        sessionId: sessionId,
                        messagesCount: messages.length,
                        storage: 'local_file_fallback'
                    });
                } catch (fileError) {
                    console.error('❌ Erro ao salvar arquivo local:', fileError.message);
                    res.status(500).json({ error: 'Erro ao salvar histórico' });
                }
            }
        } else {
            // Se não há conexão com MongoDB, salvar apenas localmente
            const fs = require('fs');
            const logsDir = path.join(__dirname, 'logs');
            const historicFile = path.join(logsDir, 'historic_sessions.json');
            
            try {
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                
                let sessions = [];
                if (fs.existsSync(historicFile)) {
                    sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                }
                
                sessions.push(sessionData);
                
                // Manter apenas as últimas 100 sessões
                if (sessions.length > 100) {
                    sessions.splice(0, sessions.length - 100);
                }
                
                fs.writeFileSync(historicFile, JSON.stringify(sessions, null, 2));
                
                console.log('📁 Histórico salvo localmente (sem MongoDB)');
                
                res.json({
                    success: true,
                    message: 'Histórico salvo localmente (MongoDB indisponível)',
                    sessionId: sessionId,
                    messagesCount: messages.length,
                    storage: 'local_file_only'
                });
            } catch (fileError) {
                console.error('❌ Erro ao salvar arquivo local:', fileError.message);
                res.status(500).json({ error: 'Erro ao salvar histórico' });
            }
        }
    } catch (error) {
        console.error('❌ Erro geral ao salvar histórico:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao salvar histórico' });
    }
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
        mongodb_logs: dbLogs ? 'connected' : 'disconnected',
        mongodb_historia: dbHistoria ? 'connected' : 'disconnected',
        mongoose_connection: isMongoConnected() ? 'connected' : 'disconnected',
        databases: {
            logs: dbLogs ? 'IIW2023A_Logs (compartilhado)' : 'indisponível',
            historia: dbHistoria ? 'HistoricoChats (individual)' : 'indisponível'
        },
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

// NOVO ENDPOINT B2.P1.A8 - Visualizar histórico de sessões
app.get('/api/chat/historico', async (req, res) => {
    try {
        const { limit = 10, sessionId } = req.query;
        
        // Tentar buscar no MongoDB primeiro
        if (dbHistoria) {
            try {
                const collection = dbHistoria.collection("sessoesChat");
                let query = {};
                
                if (sessionId) {
                    query.sessionId = sessionId;
                }
                
                const sessions = await collection
                    .find(query)
                    .sort({ loggedAt: -1 })
                    .limit(parseInt(limit))
                    .toArray();
                
                res.json({
                    success: true,
                    source: 'mongodb',
                    total: sessions.length,
                    sessions: sessions
                });
                return;
            } catch (dbError) {
                console.error('❌ Erro ao buscar histórico no MongoDB:', dbError.message);
            }
        }
        
        // Fallback para arquivo local
        const fs = require('fs');
        const historicFile = path.join(__dirname, 'logs', 'historic_sessions.json');
        
        try {
            if (fs.existsSync(historicFile)) {
                let sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                
                if (sessionId) {
                    sessions = sessions.filter(s => s.sessionId === sessionId);
                }
                
                // Ordenar por data mais recente e limitar
                sessions = sessions
                    .sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))
                    .slice(0, parseInt(limit));
                
                res.json({
                    success: true,
                    source: 'local_file',
                    total: sessions.length,
                    sessions: sessions
                });
            } else {
                res.json({
                    success: true,
                    source: 'none',
                    total: 0,
                    sessions: [],
                    message: 'Nenhum histórico encontrado'
                });
            }
        } catch (fileError) {
            console.error('❌ Erro ao ler arquivo local:', fileError.message);
            res.status(500).json({ error: 'Erro ao buscar histórico' });
        }
    } catch (error) {
        console.error('❌ Erro geral ao buscar histórico:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// NOVO ENDPOINT - Listar históricos de conversas (CRUD READ)
app.get('/api/chat/historicos', async (req, res) => {
    try {
        const { limit = 10, sortBy = 'startTime', order = 'desc' } = req.query;
        
        console.log('📖 Buscando históricos de conversas...');
        
        // Tentar buscar no MongoDB primeiro
        if (dbHistoria) {
            try {
                const collection = dbHistoria.collection("sessoesChat");
                
                // Configurar ordenação
                const sortOrder = order === 'asc' ? 1 : -1;
                const sortOptions = {};
                sortOptions[sortBy] = sortOrder;
                
                const sessions = await collection
                    .find({})
                    .sort(sortOptions)
                    .limit(parseInt(limit))
                    .toArray();
                
                // Formatar dados para exibição
                const formattedSessions = sessions.map(session => ({
                    _id: session._id,
                    sessionId: session.sessionId,
                    botId: session.botId,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    messageCount: session.messages ? session.messages.length : 0,
                    duration: session.startTime && session.endTime ? 
                        Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 0,
                    loggedAt: session.loggedAt,
                    preview: session.messages && session.messages.length > 0 ? 
                        session.messages[0].parts[0].text.substring(0, 100) + '...' : 'Sem mensagens'
                }));
                
                console.log(`✅ Encontradas ${sessions.length} sessões no MongoDB`);
                
                res.json({
                    success: true,
                    source: 'mongodb',
                    total: formattedSessions.length,
                    sessions: formattedSessions
                });
                return;
            } catch (dbError) {
                console.error('❌ Erro ao buscar no MongoDB:', dbError.message);
            }
        }
        
        // Fallback para arquivo local
        const fs = require('fs');
        const historicFile = path.join(__dirname, 'logs', 'historic_sessions.json');
        
        try {
            if (fs.existsSync(historicFile)) {
                let sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                
                // Aplicar ordenação e limite
                const sortOrder = order === 'asc' ? 1 : -1;
                sessions = sessions
                    .sort((a, b) => {
                        const aVal = new Date(a[sortBy] || a.loggedAt);
                        const bVal = new Date(b[sortBy] || b.loggedAt);
                        return sortOrder * (bVal - aVal);
                    })
                    .slice(0, parseInt(limit));
                
                // Formatar dados
                const formattedSessions = sessions.map(session => ({
                    sessionId: session.sessionId,
                    botId: session.botId,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    messageCount: session.messages ? session.messages.length : 0,
                    duration: session.startTime && session.endTime ? 
                        Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 0,
                    loggedAt: session.loggedAt,
                    preview: session.messages && session.messages.length > 0 ? 
                        session.messages[0].parts[0].text.substring(0, 100) + '...' : 'Sem mensagens'
                }));
                
                console.log(`✅ Encontradas ${sessions.length} sessões no arquivo local`);
                
                res.json({
                    success: true,
                    source: 'local_file',
                    total: formattedSessions.length,
                    sessions: formattedSessions
                });
            } else {
                res.json({
                    success: true,
                    source: 'none',
                    total: 0,
                    sessions: [],
                    message: 'Nenhum histórico encontrado'
                });
            }
        } catch (fileError) {
            console.error('❌ Erro ao ler arquivo local:', fileError.message);
            res.status(500).json({ error: 'Erro ao buscar históricos' });
        }
    } catch (error) {
        console.error('❌ Erro geral ao buscar históricos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// NOVO ENDPOINT - Obter detalhes de uma conversa específica
app.get('/api/chat/historicos/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        console.log(`📖 Buscando detalhes da sessão: ${sessionId}`);
        
        // Tentar buscar no MongoDB primeiro
        if (dbHistoria) {
            try {
                const collection = dbHistoria.collection("sessoesChat");
                const session = await collection.findOne({ sessionId: sessionId });
                
                if (session) {
                    console.log(`✅ Sessão encontrada no MongoDB: ${session.messages.length} mensagens`);
                    res.json({
                        success: true,
                        source: 'mongodb',
                        session: session
                    });
                    return;
                } else {
                    console.log('❌ Sessão não encontrada no MongoDB');
                }
            } catch (dbError) {
                console.error('❌ Erro ao buscar no MongoDB:', dbError.message);
            }
        }
        
        // Fallback para arquivo local
        const fs = require('fs');
        const historicFile = path.join(__dirname, 'logs', 'historic_sessions.json');
        
        try {
            if (fs.existsSync(historicFile)) {
                const sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                const session = sessions.find(s => s.sessionId === sessionId);
                
                if (session) {
                    console.log(`✅ Sessão encontrada no arquivo local: ${session.messages.length} mensagens`);
                    res.json({
                        success: true,
                        source: 'local_file',
                        session: session
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Sessão não encontrada'
                    });
                }
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Nenhum histórico disponível'
                });
            }
        } catch (fileError) {
            console.error('❌ Erro ao ler arquivo local:', fileError.message);
            res.status(500).json({ error: 'Erro ao buscar sessão' });
        }
    } catch (error) {
        console.error('❌ Erro geral ao buscar sessão:', error);
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
