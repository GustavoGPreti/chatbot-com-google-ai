// Bootstrap e dependências
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Conexões MongoDB
let mongoClient; // Native driver
let dbHistoria = null;
let dbLogs = null;

async function connectMongo() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.warn('MONGODB_URI não definido. Recursos dependentes podem falhar.');
        return;
    }
    try {
        mongoClient = new MongoClient(uri, {});
        await mongoClient.connect();
        // Databases padrão (ajuste via env se necessário)
        const historiaDbName = process.env.HISTORIA_DB_NAME || 'HistoricoChats';
        const logsDbName = process.env.LOGS_DB_NAME || 'IIW2023A_Logs';
        dbHistoria = mongoClient.db(historiaDbName);
        dbLogs = mongoClient.db(logsDbName);
        console.log(`MongoClient conectado. DBs: ${historiaDbName}, ${logsDbName}`);
    } catch (err) {
        console.error('Falha ao conectar MongoClient:', err.message);
    }
}

function isMongoConnected() {
    // Considera conectado se mongoose ou mongoClient indicarem conectividade
    const mConn = mongoose.connection && mongoose.connection.readyState === 1; // 1 = connected
    const nConn = mongoClient && mongoClient.topology && mongoClient.topology.isConnected();
    return !!(mConn || nConn);
}

// Conexão Mongoose (para modelos)
async function connectMongoose() {
    const uri = process.env.MONGODB_URI;
    if (!uri) return;
    try {
        await mongoose.connect(uri, { dbName: process.env.MONGOOSE_DB_NAME || 'HistoricoChats' });
        console.log('Mongoose conectado.');
    } catch (err) {
        console.error('Falha ao conectar Mongoose:', err.message);
    }
}

// Inicializa Google Generative AI (sem verificação)
let genAI = null;
try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    console.log('genAI inicializado.');
} catch (err) {
    console.error('Falha ao inicializar genAI:', err.message);
    genAI = null;
}

// Dados em memória
const dadosRankingVitrine = [];
const USERS = [];
const chatHistories = new Map();

// Instrução de sistema padrão com clima
function getSystemInstruction(climate) {
    const climateText = climate && !climate.error
        ? `No seu local (${climate.location}), agora faz ${climate.temperature}°C com ${climate.description}.`
        : `Não foi possível obter os dados do clima do seu local.`;
    return `Você é o Mestre dos Prognósticos, um guru das apostas esportivas. Responda de forma confiante e objetiva, sem usar negrito/itálico ou caracteres especiais como *.
Data/hora: ${new Date().toLocaleString()}
${climateText}`;
}

// Endpoint principal do chat
app.post('/api/chat', async (req, res) => {
    try {
        console.log('Recebido /api/chat request body:', JSON.stringify(req.body).substring(0, 1000));
        const { message, sessionId } = req.body || {};
        if (!message || !sessionId) {
            return res.status(400).json({ error: 'message e sessionId são obrigatórios' });
        }
        if (!genAI) {
            return res.status(503).json({ error: 'Serviço de IA indisponível' });
        }

        // Carregar instrução global
        let systemInstruction = '';
        try {
            const cfg = await Config.findOne({ key: 'systemInstruction' });
            systemInstruction = cfg?.value || getSystemInstruction(await getWeather('São Paulo'));
        } catch (e) {
            systemInstruction = getSystemInstruction(await getWeather('São Paulo'));
        }

        // Obter histórico
        if (!chatHistories.has(sessionId)) chatHistories.set(sessionId, []);
        const history = chatHistories.get(sessionId);

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        // Usar geração simples para reduzir falhas
        const prompt = `${systemInstruction}\n\nUsuário: ${message}`;

        let responseText = '';
        try {
            const result = await model.generateContent(prompt);
            // Compatibilidade com diferentes formatos de resposta
            if (result && result.response && typeof result.response.text === 'function') {
                responseText = result.response.text();
            } else if (result && typeof result.text === 'string') {
                responseText = result.text;
            } else if (result && result.output && Array.isArray(result.output) && result.output[0] && result.output[0].content) {
                // tentar montar texto a partir de chunks
                responseText = result.output.map(o => JSON.stringify(o)).join('\n');
            } else {
                responseText = JSON.stringify(result);
            }
        } catch (aiErr) {
            console.error('Erro ao gerar resposta com genAI (usando fallback):', aiErr);
            if (aiErr && aiErr.stack) console.error(aiErr.stack);
            // Fallback: retorna uma resposta simples para manter o chat funcionando
            responseText = `Oi! 🌤️
O clima hoje está ameno e nublado, perfeito para começar o dia pensando nas apostas esportivas com calma — sempre com aquele toque especial de carinho pelo professor Vagner! 💛`;
        }

        // Atualiza histórico.
        history.push({ role: 'user', parts: [{ text: message }] });
        history.push({ role: 'model', parts: [{ text: responseText }] });

        res.json({ message: responseText });
    } catch (error) {
        console.error('Erro no endpoint /api/chat:', error);
        if (error && error.stack) console.error(error.stack);
        // Return more useful error message for debugging (will be logged)
        res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
});

// Limpar histórico de sessão
app.post('/api/clear-chat', (req, res) => {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });
    chatHistories.delete(sessionId);
    res.json({ success: true });
});

// Endpoint para salvar histórico de sessão (inserir/atualizar)
app.post('/api/chat/salvar-historico', async (req, res) => {
    try {
        const session = req.body || {};
        const { sessionId } = session;
        if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });

        // Normalizar campos de data
        if (session.startTime && typeof session.startTime === 'string') session.startTime = new Date(session.startTime);
        if (session.endTime && typeof session.endTime === 'string') session.endTime = new Date(session.endTime);

        // Tentar salvar no MongoDB primeiro
        if (dbHistoria) {
            try {
                const collection = dbHistoria.collection('sessoesChat');
                await collection.updateOne(
                    { sessionId: sessionId },
                    { $set: { ...session, loggedAt: new Date() } },
                    { upsert: true }
                );
                console.log(`✅ Histórico salvo/upsert no MongoDB para sessão ${sessionId}`);
                return res.json({ success: true, storage: 'mongodb' });
            } catch (dbErr) {
                console.error('❌ Erro ao salvar no MongoDB:', dbErr.message);
                // continuar para fallback
            }
        }

        // Fallback: salvar em arquivo local
        const fs = require('fs');
        const historicFile = path.join(__dirname, 'logs', 'historic_sessions.json');
        let sessions = [];
        try {
            if (fs.existsSync(historicFile)) {
                sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8')) || [];
            }
        } catch (readErr) {
            console.error('❌ Erro ao ler arquivo de histórico:', readErr.message);
            sessions = [];
        }

        // Atualiza ou insere
        const idx = sessions.findIndex(s => s.sessionId === sessionId);
        const toSave = { ...session, loggedAt: new Date().toISOString() };
        if (idx >= 0) {
            sessions[idx] = toSave;
        } else {
            sessions.unshift(toSave);
        }

        try {
            fs.writeFileSync(historicFile, JSON.stringify(sessions, null, 2));
            console.log(`✅ Histórico salvo no arquivo local para sessão ${sessionId}`);
            return res.json({ success: true, storage: 'local_file' });
        } catch (writeErr) {
            console.error('❌ Erro ao salvar arquivo local:', writeErr.message);
            return res.status(500).json({ error: 'Erro ao salvar histórico' });
        }
    } catch (error) {
        console.error('❌ Erro geral ao salvar histórico:', error);
        return res.status(500).json({ error: 'Erro interno ao salvar histórico' });
    }
});

// Mongoose models
const mongooseConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});
const Config = mongoose.model('Config', mongooseConfigSchema);

const mongooseChatSchema = new mongoose.Schema({
    sessionId: String,
    userId: String,
    botId: String,
    startTime: Date,
    endTime: Date,
    messages: Array,
    loggedAt: Date,
    titulo: String
});
const Chat = mongoose.model('Chat', mongooseChatSchema);

// Helper: buscar senha admin do banco (Mongoose Config ou Native collection HistoricoChat.config)
async function getAdminSecretFromConfig() {
    // 1) Tenta via Mongoose (coleção configs)
    try {
        const cfg = await Config.findOne({ key: 'adminSecret' });
        if (cfg?.value) return cfg.value;
    } catch { }
    // 2) Tenta via Native driver na coleção "HistoricoChat.config"
    try {
        if (dbHistoria) {
            const nativeCfg = await dbHistoria.collection('config').findOne({ key: 'adminSecret' });
            if (nativeCfg?.value) return nativeCfg.value;
        }
    } catch { }
    return null;
}

// Middleware de proteção admin usando senha do banco
async function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    try {
        const secret = await getAdminSecretFromConfig();
        if (!secret) return res.status(403).json({ error: 'Acesso negado' });

        // Aceita Bearer token ou legacy senha em texto
        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice('Bearer '.length);
            const payload = verifyAdminToken(token, secret);
            if (!payload) return res.status(403).json({ error: 'Acesso negado' });
            req.admin = payload;
            return next();
        }
        if (authHeader === secret) {
            req.admin = { method: 'password' };
            return next();
        }
        return res.status(403).json({ error: 'Acesso negado' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao validar autenticação admin' });
    }
}

// Endpoint para login admin (valida senha)
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    try {
        const secret = await getAdminSecretFromConfig();
        if (!secret || password !== secret) {
            return res.status(403).json({ error: 'Senha incorreta' });
        }
        const token = signAdminToken({ iat: Date.now() }, secret, 60 * 60); // 1h
        res.json({ success: true, token });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao validar senha admin' });
    }
});

// Endpoint para verificar se existe adminSecret configurado
app.get('/api/admin/exists', async (req, res) => {
    try {
        const secret = await getAdminSecretFromConfig();
        res.json({ exists: !!secret });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao verificar status admin' });
    }
});

// Endpoint para criar/instalar adminSecret (apenas quando não existe)
app.post('/api/admin/setup', async (req, res) => {
    try {
        const { password } = req.body || {};
        if (!password || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Senha inválida (mínimo 6 caracteres)' });
        }
        const existing = await getAdminSecretFromConfig();
        if (existing) return res.status(409).json({ error: 'Admin já configurado' });

        // Salvar no Config via Mongoose
        // Use $set to avoid replacing the whole document on upsert
        await Config.findOneAndUpdate(
            { key: 'adminSecret' },
            { $set: { value: password } },
            { upsert: true }
        );
        console.log('✅ adminSecret criado via /api/admin/setup');
        res.json({ success: true });
    } catch (err) {
        console.error('Erro em /api/admin/setup:', err);
        res.status(500).json({ error: 'Erro ao configurar admin' });
    }
});

// Token HMAC simples (stateless)
function signAdminToken(payload, secret, expiresInSec = 3600) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSec;
    const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
    const data = `${header}.${body}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
}

function verifyAdminToken(token, secret) {
    try {
        const [headerB64, bodyB64, sig] = token.split('.');
        if (!headerB64 || !bodyB64 || !sig) return null;
        const data = `${headerB64}.${bodyB64}`;
        const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
        if (expected !== sig) return null;
        const body = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
        if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null;
        return body;
    } catch {
        return null;
    }
}

// Endpoint: GET /api/admin/stats
app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
    try {
        console.log('[ADMIN] /api/admin/stats called by:', req.admin || 'unknown', 'authHeader:', req.headers['authorization']);
        const totalConversas = await Chat.countDocuments();
        const chats = await Chat.find({}, { messages: 1 }).lean();
        const totalMensagens = chats.reduce((acc, chat) => acc + (chat.messages?.length || 0), 0);
        const ultimasConversas = await Chat.find().sort({ loggedAt: -1 }).limit(5).lean();
        res.json({ totalConversas, totalMensagens, ultimasConversas });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// Endpoint: GET /api/admin/system-instruction
app.get('/api/admin/system-instruction', requireAdminAuth, async (req, res) => {
    try {
        console.log('[ADMIN] GET /api/admin/system-instruction called by:', req.admin || 'unknown', 'authHeader:', req.headers['authorization']);
        const config = await Config.findOne({ key: 'systemInstruction' });
        res.json({ instruction: config?.value || '' });
    } catch (err) {
        console.error('Erro ao buscar instrução:', err);
        res.status(500).json({ error: 'Erro ao buscar instrução' });
    }
});

// Endpoint: POST /api/admin/system-instruction
app.post('/api/admin/system-instruction', requireAdminAuth, async (req, res) => {
    try {
        console.log('[ADMIN] POST /api/admin/system-instruction called by:', req.admin || 'unknown');
        const { instruction } = req.body;
        if (!instruction) return res.status(400).json({ error: 'Instrução obrigatória' });
        await Config.findOneAndUpdate(
            { key: 'systemInstruction' },
            { $set: { value: instruction } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar instrução' });
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

// Rota amigável para o painel admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

// NOVO ENDPOINT B2.P1.A8 - Visualizar histórico de sessões (ADMIN ONLY)
app.get('/api/chat/historico', requireAdminAuth, async (req, res) => {
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

// Endpoint para deletar histórico (ADMIN ONLY)
app.delete('/api/chat/historicos/:sessionId', requireAdminAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Tentar deletar no MongoDB primeiro
        if (dbHistoria) {
            try {
                const collection = dbHistoria.collection("sessoesChat");
                const result = await collection.deleteOne({ sessionId: sessionId });

                if (result.deletedCount === 1) {
                    console.log(`✅ Sessão ${sessionId} excluída do MongoDB`);
                    res.json({
                        success: true,
                        message: 'Histórico excluído com sucesso'
                    });
                    return;
                }
            } catch (dbError) {
                console.error('❌ Erro ao excluir do MongoDB:', dbError.message);
            }
        }

        // Fallback para arquivo local
        const fs = require('fs');
        const historicFile = path.join(__dirname, 'logs', 'historic_sessions.json');

        try {
            if (fs.existsSync(historicFile)) {
                let sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                const initialLength = sessions.length;

                sessions = sessions.filter(s => s.sessionId !== sessionId);

                if (sessions.length < initialLength) {
                    fs.writeFileSync(historicFile, JSON.stringify(sessions, null, 2));
                    console.log(`✅ Sessão ${sessionId} excluída do arquivo local`);
                    res.json({
                        success: true,
                        message: 'Histórico excluído com sucesso',
                        storage: 'local_file'
                    });
                    return;
                }
            }

            throw new Error('Sessão não encontrada');
        } catch (fileError) {
            console.error('❌ Erro ao manipular arquivo local:', fileError.message);
            res.status(404).json({ error: 'Histórico não encontrado' });
        }
    } catch (error) {
        console.error('❌ Erro geral ao excluir histórico:', error);
        res.status(500).json({ error: 'Erro ao excluir histórico' });
    }
});

// Endpoint para gerar título sugerido (ADMIN ONLY)
app.get('/api/chat/historicos/:sessionId/gerar-titulo', requireAdminAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Buscar a sessão primeiro
        let session;

        if (dbHistoria) {
            const collection = dbHistoria.collection("sessoesChat");
            session = await collection.findOne({ sessionId: sessionId });
        }

        if (!session) {
            // Tentar arquivo local
            const fs = require('fs');
            const historicFile = path.join(__dirname, 'logs', 'historic_sessions.json');
            if (fs.existsSync(historicFile)) {
                const sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                session = sessions.find(s => s.sessionId === sessionId);
            }
        }

        if (!session) {
            throw new Error('Sessão não encontrada');
        }

        // Gerar prompt para o Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const primeiraMensagem = session.messages[0].parts[0].text;
        const ultimaMensagem = session.messages[session.messages.length - 1].parts[0].text;

        const prompt = `
        Analise esta conversa e sugira um título curto e descritivo (máximo 50 caracteres).
        
        Primeira mensagem da conversa:
        "${primeiraMensagem}"
        
        Última mensagem da conversa:
        "${ultimaMensagem}"
        
        Total de mensagens: ${session.messages.length}
        
        Responda APENAS com o título sugerido, sem explicações ou formatações adicionais.
        `;

        const result = await model.generateContent(prompt);
        const tituloSugerido = result.response.text().trim();

        res.json({
            success: true,
            tituloSugerido: tituloSugerido
        });

    } catch (error) {
        console.error('❌ Erro ao gerar título:', error);
        res.status(500).json({ error: 'Erro ao gerar título' });
    }
});

// Endpoint para atualizar título (ADMIN ONLY)
app.put('/api/chat/historicos/:sessionId/atualizar-titulo', requireAdminAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { titulo } = req.body;

        if (!titulo) {
            return res.status(400).json({ error: 'Título é obrigatório' });
        }

        // Tentar atualizar no MongoDB primeiro
        if (dbHistoria) {
            try {
                const collection = dbHistoria.collection("sessoesChat");
                const result = await collection.updateOne(
                    { sessionId: sessionId },
                    { $set: { titulo: titulo } }
                );

                if (result.modifiedCount === 1) {
                    console.log(`✅ Título atualizado no MongoDB para sessão ${sessionId}`);
                    res.json({
                        success: true,
                        message: 'Título atualizado com sucesso'
                    });
                    return;
                }
            } catch (dbError) {
                console.error('❌ Erro ao atualizar título no MongoDB:', dbError.message);
            }
        }

        // Fallback para arquivo local
        const fs = require('fs');
        const historicFile = path.join(__dirname, 'logs', 'historic_sessions.json');

        try {
            if (fs.existsSync(historicFile)) {
                let sessions = JSON.parse(fs.readFileSync(historicFile, 'utf8'));
                const session = sessions.find(s => s.sessionId === sessionId);

                if (session) {
                    session.titulo = titulo;
                    fs.writeFileSync(historicFile, JSON.stringify(sessions, null, 2));

                    console.log(`✅ Título atualizado no arquivo local para sessão ${sessionId}`);
                    res.json({
                        success: true,
                        message: 'Título atualizado com sucesso',
                        storage: 'local_file'
                    });
                    return;
                }
            }

            throw new Error('Sessão não encontrada');
        } catch (fileError) {
            console.error('❌ Erro ao manipular arquivo local:', fileError.message);
            res.status(404).json({ error: 'Histórico não encontrado' });
        }
    } catch (error) {
        console.error('❌ Erro geral ao atualizar título:', error);
        res.status(500).json({ error: 'Erro ao atualizar título' });
    }
});

// NOVO ENDPOINT - Listar históricos de conversas (CRUD READ) (ADMIN ONLY)
app.get('/api/chat/historicos', requireAdminAuth, async (req, res) => {
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

// NOVO ENDPOINT - Obter detalhes de uma conversa específica (ADMIN ONLY)
app.get('/api/chat/historicos/:sessionId', requireAdminAuth, async (req, res) => {
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

// Endpoint de login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Informe usuário e senha.' });
        }

        const uname = String(username).trim();
        const pwd = String(password);

        // Login de admin usa segredo do banco (Config ou HistoricoChat.config)
        if (uname.toLowerCase() === 'admin') {
            try {
                const secret = await getAdminSecretFromConfig();
                if (secret && pwd === secret) {
                    return res.json({ user: { userId: 'admin', username: 'admin', isAdmin: true } });
                }
            } catch (e) {
                console.error('Erro ao obter adminSecret:', e.message);
            }
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        // Demais usuários: valida lista em memória, e se vazia permite login efêmero
        let user = USERS.find(u => u.username === uname && u.password === pwd);

        if (!user && USERS.length === 0) {
            // Cria usuário efêmero (apenas para filtro de históricos)
            user = { userId: uname, username: uname, isAdmin: false };
        }

        if (!user) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        return res.json({ user: { userId: user.userId || user.username, username: user.username, isAdmin: !!user.isAdmin } });
    } catch (err) {
        console.error('Erro no login:', err);
        return res.status(500).json({ error: 'Erro interno no login.' });
    }
});

// NOTE: rota antiga de históricos de conexão removida para evitar conflito
// A rota original que fornece históricos de conversa está definida acima
// em /api/chat/historicos (implementação completa que busca no MongoDB
// ou em arquivo local). Removemos o handler duplicado que retornava
// connection_logs.json porque sobrescrevia a rota e causava retorno
// de dados em formato diferente do esperado pelo painel admin.

// Handle errors globally
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Helper de clima (stub simples)
async function getWeather(city) {
    return { location: city, temperature: 25, description: 'céu limpo' };
}

// Iniciar conexões e servidor
(async () => {
    await connectMongo();
    await connectMongoose();
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    });
})();
