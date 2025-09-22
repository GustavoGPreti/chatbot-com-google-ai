window.onload = () => {
    let adminSecret = '';
    let adminToken = '';

    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const saveInstructionBtn = document.getElementById('save-instruction-btn');

    // Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = {
        dashboard: document.getElementById('tab-dashboard'),
        historicos: document.getElementById('tab-historicos'),
        instrucao: document.getElementById('tab-instrucao')
    };
    function setActiveTab(name) {
        tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
        Object.entries(tabPanels).forEach(([k, el]) => el.classList.toggle('active', k === name));
        if (name === 'dashboard') { loadMetrics(); }
        if (name === 'historicos') { loadHistoricos(); }
        if (name === 'instrucao') { loadInstruction(); }
    }
    tabButtons.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));

    // Login
    loginBtn.onclick = async () => {
        const uname = (document.getElementById('admin-username')?.value || '').trim();
        const pwd = document.getElementById('admin-password').value;
        document.getElementById('login-error').innerText = '';
        if (!uname || !pwd) {
            document.getElementById('login-error').innerText = 'Informe usuário e senha.';
            return;
        }
        try {
            // Primeiro, valida como no histórico
            const resLogin = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: uname, password: pwd })
            });
            if (!resLogin.ok) {
                const data = await resLogin.json().catch(() => ({}));
                document.getElementById('login-error').innerText = data.error || 'Usuário ou senha inválidos.';
                return;
            }
            const dataLogin = await resLogin.json();
            // Se for admin, pegar token do painel
            if (uname.toLowerCase() === 'admin') {
                const resAdmin = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                if (!resAdmin.ok) {
                    document.getElementById('login-error').innerText = 'Erro ao autenticar admin.';
                    return;
                }
                const dataAdmin = await resAdmin.json();
                adminToken = dataAdmin.token || '';
            }
            adminSecret = pwd; // fallback legacy
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            setActiveTab('dashboard');
        } catch (err) {
            document.getElementById('login-error').innerText = 'Erro de conexão com o servidor.';
            console.error('Erro de rede:', err);
        }
    };

    logoutBtn.onclick = () => {
        adminSecret = '';
        adminToken = '';
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('admin-password').value = '';
        document.getElementById('login-error').innerText = '';
        document.getElementById('save-status').innerText = '';
    };

    // Dashboard metrics
    async function loadMetrics() {
        try {
            const res = await fetch('/api/admin/stats', {
                headers: {
                    'authorization': adminToken ? `Bearer ${adminToken}` : adminSecret
                }
            });
            if (!res.ok) {
                document.getElementById('total-conversas').innerText = '--';
                document.getElementById('total-mensagens').innerText = '--';
                document.getElementById('ultimas-conversas').innerHTML = '<li>Erro ao carregar métricas</li>';
                console.error('Erro ao carregar métricas:', res.status, res.statusText);
                return;
            }
            const data = await res.json();
            document.getElementById('total-conversas').innerText = data.totalConversas;
            document.getElementById('total-mensagens').innerText = data.totalMensagens;
            const ul = document.getElementById('ultimas-conversas');
            ul.innerHTML = '';
            data.ultimasConversas.forEach(chat => {
                const li = document.createElement('li');
                li.innerText = `ID: ${chat.sessionId} | Mensagens: ${chat.messages.length}`;
                ul.appendChild(li);
            });
        } catch (err) {
            console.error('Erro de rede em loadMetrics:', err);
        }
    }

    // Instrução
    async function loadInstruction() {
        try {
            const res = await fetch('/api/admin/system-instruction', {
                headers: {
                    'authorization': adminToken ? `Bearer ${adminToken}` : adminSecret
                }
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
                    'authorization': adminToken ? `Bearer ${adminToken}` : adminSecret
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

    // Históricos
    const historicosBody = document.getElementById('historicos-body');
    const histSortBy = document.getElementById('hist-sortBy');
    const histOrder = document.getElementById('hist-order');
    const histLimit = document.getElementById('hist-limit');
    const histReload = document.getElementById('reload-historicos');
    const histDetail = document.getElementById('historico-detail');

    async function loadHistoricos() {
        if (!historicosBody) return;
        historicosBody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';
        const params = new URLSearchParams({
            sortBy: histSortBy.value,
            order: histOrder.value,
            limit: histLimit.value
        });
        try {
            const res = await fetch(`/api/chat/historicos?${params.toString()}`);
            if (!res.ok) {
                historicosBody.innerHTML = '<tr><td colspan="7">Erro ao carregar</td></tr>';
                return;
            }
            const data = await res.json();
            const rows = (data.sessions || []).map(s => {
                const id = s.sessionId || s._id || '-';
                return `<tr>
                    <td>${id}</td>
                    <td>${s.startTime ? new Date(s.startTime).toLocaleString() : '-'}</td>
                    <td>${s.endTime ? new Date(s.endTime).toLocaleString() : '-'}</td>
                    <td>${s.messageCount ?? (s.messages ? s.messages.length : 0)}</td>
                    <td>${s.duration ?? 0}</td>
                    <td>${(s.preview || '').replace(/</g,'&lt;')}</td>
                    <td class="actions">
                        <button data-act="ver" data-id="${id}">Ver</button>
                        <button data-act="titulo" data-id="${id}">Gerar Título</button>
                        <button data-act="excluir" data-id="${id}">Excluir</button>
                    </td>
                </tr>`;
            }).join('');
            historicosBody.innerHTML = rows || '<tr><td colspan="7">Sem dados</td></tr>';
        } catch (e) {
            historicosBody.innerHTML = '<tr><td colspan="7">Erro ao carregar</td></tr>';
            console.error(e);
        }
    }

    async function verHistorico(sessionId) {
        histDetail.style.display = 'block';
        histDetail.innerHTML = 'Carregando detalhes...';
        try {
            const res = await fetch(`/api/chat/historicos/${encodeURIComponent(sessionId)}`);
            if (!res.ok) { histDetail.innerHTML = 'Erro ao carregar detalhes'; return; }
            const data = await res.json();
            const s = data.session;
            if (!s) { histDetail.innerHTML = 'Não encontrado'; return; }
            const title = s.titulo ? `<div class="muted">Título: ${s.titulo}</div>` : '';
            const msgs = (s.messages || []).map((m, i) => `<div><b>${m.role}</b>: ${m.parts?.[0]?.text || ''}</div>`).join('');
            histDetail.innerHTML = `<h3>Sessão ${s.sessionId}</h3>${title}<div class="muted">${new Date(s.loggedAt||s.startTime||Date.now()).toLocaleString()}</div><div style="margin-top:8px; max-height:260px; overflow:auto; border-top:1px solid #eee; padding-top:8px;">${msgs}</div>`;
        } catch (e) {
            histDetail.innerHTML = 'Erro ao carregar detalhes';
        }
    }

    async function gerarTitulo(sessionId) {
        try {
            const res = await fetch(`/api/chat/historicos/${encodeURIComponent(sessionId)}/gerar-titulo`);
            if (!res.ok) { alert('Erro ao gerar título'); return; }
            const data = await res.json();
            alert(`Título sugerido: ${data.tituloSugerido}`);
        } catch (e) {
            alert('Erro ao gerar título');
        }
    }

    async function excluirHistorico(sessionId) {
        if (!confirm('Tem certeza que deseja excluir este histórico?')) return;
        try {
            const res = await fetch(`/api/chat/historicos/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
            if (!res.ok) { alert('Erro ao excluir'); return; }
            loadHistoricos();
            histDetail.style.display = 'none';
        } catch (e) {
            alert('Erro ao excluir');
        }
    }

    if (historicosBody) {
        historicosBody.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            const id = btn.getAttribute('data-id');
            if (act === 'ver') verHistorico(id);
            if (act === 'titulo') gerarTitulo(id);
            if (act === 'excluir') excluirHistorico(id);
        });
    }
    if (histReload) histReload.addEventListener('click', loadHistoricos);
};
