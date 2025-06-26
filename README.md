# Gemini AI Chatbot - Mestre dos Prognósticos

## Descrição
Chatbot inteligente especializado em apostas esportivas, desenvolvido com Google Gemini AI e múltiplas conexões MongoDB.

## ✅ Atividades Implementadas
- **B2.P1.A7** - Log Mestre & Ranking de Bots
- **B2.P1.A8** - Arquivistas de IA (Histórico completo de sessões)

## Funcionalidades

### 🤖 Chatbot Inteligente
- Conversas em português com personalidade do "Mestre dos Prognósticos"
- Histórico de conversa por sessão
- Informações meteorológicas contextuais
- Interface moderna e responsiva

### 📊 Sistema de Logs (B2.P1.A7)
- Registro automático de acessos dos usuários
- Armazenamento no MongoDB Atlas compartilhado
- Coleta de IP e ações dos usuários

### 🏆 Sistema de Ranking (B2.P1.A7)
- Ranking de bots em tempo real
- Contador de acessos por bot
- API para visualização do ranking

### 🗃️ Arquivistas de IA (B2.P1.A8)
- **Histórico completo de sessões** salvo automaticamente
- **Múltiplas conexões MongoDB** (compartilhado + individual)
- Estrutura completa com mensagens, timestamps e metadados
- Sistema robusto com fallback local

## Estrutura do Projeto

```
├── server.js           # Servidor principal com múltiplas conexões
├── public/
│   ├── index.html      # Interface do usuário
│   ├── app.js          # Frontend com histórico automático
│   └── style.css       # Estilos
├── logs/              # Logs locais (fallback)
│   ├── connection_logs.json      # Logs de conexão
│   └── historic_sessions.json    # Histórico de sessões
├── package.json        # Dependências
├── render.yaml         # Configuração de deploy
└── .env               # Variáveis de ambiente
```

## Configuração

### Variáveis de Ambiente (.env)
```env
PORT=3000
GEMINI_API_KEY=sua_chave_gemini_aqui
OPENWEATHER_API_KEY=sua_chave_openweather_aqui

# B2.P1.A7 - Logs e ranking (DB compartilhado)
MONGODB_URI=mongodb+srv://user_log_acess:senha@cluster.mongodb.net/IIW2023A_Logs
MONGO_URI_LOGS=mongodb+srv://user_log_acess:senha@cluster.mongodb.net/IIW2023A_Logs

# B2.P1.A8 - Histórico de sessões (DB individual)
MONGO_URI_HISTORIA=mongodb+srv://seu_usuario:sua_senha@cluster.mongodb.net/HistoricoChats
```

### Instalação
```bash
npm install
node server.js
```

## Endpoints da API

### 1. Chat
- **POST** `/api/chat`
  - Envia mensagem para o chatbot
  - Body: `{ message: string, sessionId: string }`

### 2. Logs de Conexão (B2.P1.A7)
- **POST** `/api/log-connection`
  - Registra acesso do usuário
  - Body: `{ ip: string, acao: string }`
  - Salva na coleção: `tb_cl_user_log_acess` (DB compartilhado)

- **GET** `/api/user-info`
  - Retorna IP do cliente

### 3. Sistema de Ranking (B2.P1.A7)
- **POST** `/api/ranking/registrar-acesso-bot`
  - Registra acesso ao bot no ranking
  - Body: `{ botId: string, nomeBot: string, timestampAcesso: string }`

- **GET** `/api/ranking/visualizar`
  - Visualiza ranking atual dos bots
  - Retorna array ordenado por total de acessos

### 4. Histórico de Sessões (B2.P1.A8) 🆕
- **POST** `/api/chat/salvar-historico`
  - Salva histórico completo da sessão
  - Body: `{ sessionId, userId, botId, startTime, endTime, messages }`
  - Salva na coleção: `sessoesChat` (DB individual)

- **GET** `/api/chat/historico`
  - Visualiza histórico de sessões salvas
  - Query params: `?limit=10&sessionId=xyz`
  - Retorna sessões com mensagens completas

### 5. Gerenciamento de Chat
- **POST** `/api/clear-chat`
  - Limpa histórico da sessão atual
  - Body: `{ sessionId: string }`

### 6. Status do Sistema
- **GET** `/api/status`
  - Verifica status das conexões MongoDB
  - Retorna status de ambos os bancos (logs + histórico)
  - Body: `{ sessionId: string }`

## Estrutura dos Dados

### B2.P1.A7 - Logs Simples (DB Compartilhado)
**Coleção:** `tb_cl_user_log_acess`
```json
{
  "col_data": "2025-06-26",
  "col_hora": "14:30:25", 
  "col_nome_bot": "Chatbot de Apostas Esportivas",
  "col_IP": "192.168.1.100",
  "col_acao": "acesso_inicial_chatbot"
}
```

### B2.P1.A8 - Histórico Completo (DB Individual) 🆕
**Coleção:** `sessoesChat`
```json
{
  "sessionId": "1719401818367_k2x9m8p3q",
  "userId": null,
  "botId": "chatbot-mestre-prognosticos",
  "startTime": "2025-06-26T10:30:00.000Z",
  "endTime": "2025-06-26T10:45:30.000Z",
  "messages": [
    {
      "role": "model",
      "parts": [{ "text": "Olá! Sou o Mestre dos Prognósticos..." }],
      "timestamp": "2025-06-26T10:30:00.000Z"
    },
    {
      "role": "user", 
      "parts": [{ "text": "Me dê uma dica de aposta para hoje" }],
      "timestamp": "2025-06-26T10:30:15.000Z"
    },
    {
      "role": "model",
      "parts": [{ "text": "Analisando os jogos de hoje..." }],
      "timestamp": "2025-06-26T10:30:18.000Z"
    }
  ],
  "loggedAt": "2025-06-26T10:45:30.000Z"
}
```

### Sistema de Ranking (Em Memória)
```json
{
  "botId": "chatbot-mestre-prognosticos",
  "nomeBot": "Mestre dos Prognósticos - Chatbot de Apostas Esportivas",
  "contagem": 15,
  "ultimoAcesso": "2025-06-26T10:45:30.000Z"
}
```

## Deploy

### Render.com
1. Configure as variáveis de ambiente no painel do Render:
   - `GEMINI_API_KEY`
   - `OPENWEATHER_API_KEY`
   - `MONGO_URI_LOGS` (DB compartilhado)
   - `MONGO_URI_HISTORIA` (DB individual)
2. Conecte o repositório GitHub
3. O arquivo `render.yaml` contém as configurações de build

### MongoDB Atlas
- **DB Compartilhado** (B2.P1.A7): Logs simples e ranking
- **DB Individual** (B2.P1.A8): Histórico completo de sessões
- String de conexão configurada na variável `MONGODB_URI`

## ✅ **ATIVIDADE B2.P1.A8 - ARQUIVISTAS DE IA - CONCLUÍDA!**

### 🎯 **Funcionalidades Implementadas:**

#### 🔗 **Múltiplas Conexões MongoDB:**
- ✅ **DB Compartilhado** (`IIW2023A_Logs`): Logs simples e ranking
- ✅ **DB Individual** (`HistoricoChats`): Histórico completo de sessões
- ✅ Função genérica `connectToMongoDB(uri, dbName)` implementada
- ✅ Fallback robusto para arquivo local quando MongoDB indisponível

#### 📊 **Endpoint de Histórico Completo:**
- ✅ **POST** `/api/chat/salvar-historico`: Salva sessões completas
- ✅ **GET** `/api/chat/historico`: Visualiza histórico salvo
- ✅ Validação de dados obrigatórios (sessionId, botId, messages)
- ✅ Estrutura completa com timestamps e metadados

#### 🖥️ **Frontend Inteligente:**
- ✅ Função `salvarHistoricoSessao()` implementada
- ✅ `sessionId` único com `Date.now() + Math.random()`
- ✅ Histórico salvo automaticamente após cada resposta do bot
- ✅ Histórico final salvo ao limpar chat (nova sessão)
- ✅ Controle completo de mensagens com timestamps

#### ⚙️ **Configuração de Deploy:**
- ✅ Variáveis de ambiente configuradas para Render
- ✅ Sistema compatível com ambas as atividades B2.P1.A7 e B2.P1.A8
- ✅ Fallbacks implementados para máxima robustez

### 📈 **Status de Funcionamento:**

```bash
# Conexões MongoDB
✅ mongodb_logs: connected (IIW2023A_Logs - compartilhado)  
✅ mongodb_historia: connected (HistoricoChats - individual)
✅ mongoose_connection: connected

# Endpoints Funcionais
✅ POST /api/chat/salvar-historico
✅ GET /api/chat/historico  
✅ GET /api/status (mostra status das múltiplas conexões)
✅ Todos os endpoints B2.P1.A7 mantidos funcionais

# Automatização Frontend
✅ Histórico salvo automaticamente a cada interação
✅ Nova sessão gerada ao limpar chat
✅ Mensagens completas com role, parts e timestamps
```

## 🚀 **Como Usar o Sistema Completo:**

### 1. **Teste Local:**
```bash
# Iniciar servidor
node server.js

# Verificar status das conexões
curl http://localhost:3000/api/status

# Testar histórico
curl -X GET "http://localhost:3000/api/chat/historico?limit=5"
```

### 2. **Funcionamento Automático:**
- 🔄 **Logs B2.P1.A7**: Salvos automaticamente no acesso inicial
- 📚 **Histórico B2.P1.A8**: Salvo automaticamente após cada mensagem
- 🏆 **Ranking**: Atualizado automaticamente no acesso ao bot
- 💾 **Fallbacks**: Sistema local funciona sem MongoDB

### 3. **Deploy no Render:**
```env
# Configurar no painel do Render:
GEMINI_API_KEY=sua_chave_gemini
OPENWEATHER_API_KEY=sua_chave_weather
MONGO_URI_LOGS=mongodb+srv://user_log_acess:Log4c3ss2025@cluster0.nbt3sks.mongodb.net/IIW2023A_Logs
MONGO_URI_HISTORIA=mongodb+srv://gustavo:nwJxxvi2lMbWJ11P@cluster0.5txexrm.mongodb.net/HistoricoChats
```

### 4. **Monitoramento:**
- 📊 **Console**: Logs detalhados de todas as operações
- 🔍 **Debug**: Use `/api/chat/historico` para verificar dados salvos
- ⚡ **Status**: Use `/api/status` para verificar conexões

---

## 🏆 **RESULTADOS FINAIS:**

### ✅ **B2.P1.A7 + B2.P1.A8 = SISTEMA COMPLETO!**
- 📝 **Logs simples** + **Histórico completo** funcionando simultaneamente
- 🔗 **Múltiplas conexões MongoDB** implementadas com sucesso
- 🛡️ **Sistema robusto** com fallbacks para máxima disponibilidade
- 🚀 **Pronto para produção** no Render com todas as funcionalidades

**O chatbot agora é um verdadeiro "Arquivista de IA" que registra tudo!**

## Tecnologias Utilizadas

- **Backend**: Node.js, Express
- **Database**: MongoDB Atlas
- **AI**: Google Gemini API
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **APIs Externas**: OpenWeatherMap
- **Deploy**: Render.com

## Funcionalidades Automáticas

### No carregamento da página:
1. ✅ Registro automático de log de conexão
2. ✅ Registro automático no ranking de bots
3. ✅ Inicialização do chat com mensagem de boas-vindas

### Durante o uso:
1. ✅ Histórico de conversa mantido por sessão
2. ✅ Informações meteorológicas integradas
3. ✅ Interface responsiva e moderna

## Monitoramento

- Logs de conexão salvos automaticamente no MongoDB
- Ranking de bots atualizado em tempo real
- Console do servidor mostra atualizações do ranking
- Endpoint `/api/ranking/visualizar` para verificar dados

## Autor
Desenvolvido para IFCODE - Curso de Serviços em Nuvem
