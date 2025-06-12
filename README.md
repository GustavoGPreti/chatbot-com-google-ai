# Gemini AI Chatbot - Mestre dos Prognósticos

## Descrição
Chatbot inteligente especializado em apostas esportivas, desenvolvido com Google Gemini AI, MongoDB e Node.js.

## Funcionalidades

### 🤖 Chatbot Inteligente
- Conversas em português com personalidade do "Mestre dos Prognósticos"
- Histórico de conversa por sessão
- Informações meteorológicas contextuais
- Interface moderna e responsiva

### 📊 Sistema de Logs
- Registro automático de acessos dos usuários
- Armazenamento no MongoDB Atlas
- Coleta de IP e ações dos usuários

### 🏆 Sistema de Ranking
- Ranking de bots em tempo real
- Contador de acessos por bot
- API para visualização do ranking

## Estrutura do Projeto

```
├── server.js           # Servidor principal
├── public/
│   ├── index.html      # Interface do usuário
│   ├── app.js          # Lógica do frontend
│   └── style.css       # Estilos
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
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/database
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

### 2. Logs de Conexão
- **POST** `/api/log-connection`
  - Registra acesso do usuário
  - Body: `{ ip: string, acao: string }`
  - Salva na coleção: `tb_cl_user_log_acess`

- **GET** `/api/user-info`
  - Retorna IP do cliente

### 3. Sistema de Ranking
- **POST** `/api/ranking/registrar-acesso-bot`
  - Registra acesso ao bot no ranking
  - Body: `{ botId: string, nomeBot: string, timestampAcesso: string }`

- **GET** `/api/ranking/visualizar`
  - Visualiza ranking atual dos bots
  - Retorna array ordenado por total de acessos

### 4. Gerenciamento de Chat
- **POST** `/api/clear-chat`
  - Limpa histórico da sessão
  - Body: `{ sessionId: string }`

## Estrutura do MongoDB

### Coleção: tb_cl_user_log_acess
```json
{
  "col_data": "2024-12-19",
  "col_hora": "14:30:25", 
  "col_IP": "192.168.1.100",
  "col_acao": "acesso_inicial_chatbot"
}
```

### Sistema de Ranking (Em Memória)
```json
{
  "botId": "chatbot-mestre-prognosticos",
  "nomeBot": "Mestre dos Prognósticos - IFCODE",
  "totalAcessos": 15,
  "primeiroAcesso": "2024-12-19T14:30:25.123Z",
  "ultimoAcesso": "2024-12-19T16:45:10.456Z"
}
```

## Deploy

### Render.com
1. Configure as variáveis de ambiente no painel do Render
2. Conecte o repositório GitHub
3. O arquivo `render.yaml` contém as configurações de build

### MongoDB Atlas
- Utiliza cluster compartilhado para logs
- String de conexão configurada na variável `MONGODB_URI`

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
