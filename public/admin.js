window.onload = () => {
    let adminSecret = '';

    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const saveInstructionBtn = document.getElementById('save-instruction-btn');

    loginBtn.onclick = async () => {
        const pwd = document.getElementById('admin-password').value;
        document.getElementById('login-error').innerText = '';
        if (!pwd) {
            document.getElementById('login-error').innerText = 'Digite a senha.';
            return;
        }
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pwd })
            });

            if (res.status === 403) {
                document.getElementById('login-error').innerText = 'Senha incorreta!';
                return;
            }
            if (!res.ok) {
                document.getElementById('login-error').innerText = 'Erro ao autenticar.';
                console.error('Falha no login:', res.status, res.statusText);
                return;
            }

            adminSecret = pwd; // ⚠️ ideal: substituir por token retornado pelo backend
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            loadMetrics();
            loadInstruction();
        } catch (err) {
            document.getElementById('login-error').innerText = 'Erro de conexão com o servidor.';
            console.error('Erro de rede:', err);
        }
    };

    logoutBtn.onclick = () => {
        adminSecret = '';
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('admin-password').value = '';
        document.getElementById('login-error').innerText = '';
        document.getElementById('save-status').innerText = '';
    };

    async function loadMetrics() {
        try {
            const res = await fetch('/api/admin/stats', {
                headers: { 'authorization': adminSecret }
            });
            if (!res.ok) {
                document.getElementById('total-conversas').innerText = '-';
                document.getElementById('total-mensagens').innerText = '-';
                document.getElementById('ultimas-conversas').innerHTML = '<li>Erro ao carregar métricas</li>';
                console.error('Erro ao carregar métricas:', res.status, res.statusText);
                return;
            }
            const data = await res.json();
            document.getElementById('total-conversas').innerText = data.totalConversas;
            document.getElementById('total-mensagens').innerText = data.totalMensagens;
            document.getElementById('ultimas-conversas').innerHTML = '';
            data.ultimasConversas.forEach(chat => {
                const li = document.createElement('li');
                li.innerText = `ID: ${chat.sessionId} | Mensagens: ${chat.messages.length}`;
                document.getElementById('ultimas-conversas').appendChild(li);
            });
        } catch (err) {
            console.error('Erro de rede em loadMetrics:', err);
        }
    }

    async function loadInstruction() {
        try {
            const res = await fetch('/api/admin/system-instruction', {
                headers: { 'authorization': adminSecret }
            });
            if (!res.ok) {
                document.getElementById('instruction-text').value = '';
                document.getElementById('save-status').innerText = 'Erro ao carregar instrução.';
                console.error('Erro ao carregar instrução:', res.status, res.statusText);
                return;
            }
            const data = await res.json();
            document.getElementById('instruction-text').value = data.instruction || '';
        } catch (err) {
            console.error('Erro de rede em loadInstruction:', err);
        }
    }

    saveInstructionBtn.onclick = async () => {
        const newInstruction = document.getElementById('instruction-text').value;
        document.getElementById('save-status').innerText = '';
        if (!newInstruction) {
            document.getElementById('save-status').innerText = 'Digite a instrução.';
            return;
        }
        try {
            const res = await fetch('/api/admin/system-instruction', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'authorization': adminSecret
                },
                body: JSON.stringify({ instruction: newInstruction })
            });
            if (res.ok) {
                document.getElementById('save-status').innerText = 'Instrução atualizada!';
                loadInstruction();
            } else {
                document.getElementById('save-status').innerText = 'Erro ao salvar.';
                console.error('Erro ao salvar instrução:', res.status, res.statusText);
            }
        } catch (err) {
            console.error('Erro de rede em saveInstruction:', err);
        }
    };
};
