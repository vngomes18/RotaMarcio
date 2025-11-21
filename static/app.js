// App de Rotas de Maricá - JavaScript

// Variáveis globais
let mapa;
let marcadorOrigem = null;
let marcadorDestino = null;
let caminhoRota = null;
let pontosReferencia = [];
let origemCoords = null;
let destinoCoords = null;
let notificacaoAtual = null;
let modoTransporte = 'driving'; // Modo padrão
let rotasCalculadas = {}; // Armazenar rotas para todos os modos

// Função para mostrar notificações
function mostrarNota(mensagem, tipo = 'info') {
    // Remover notificação anterior se existir
    if (notificacaoAtual) {
        document.body.removeChild(notificacaoAtual);
    }
    
    // Criar elemento de notificação
    const nota = document.createElement('div');
    nota.className = `notificacao notificacao-${tipo}`;
    nota.innerHTML = `
        <span>${mensagem}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
    // Estilos CSS inline para a notificação
    nota.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${tipo === 'info' ? '#2196F3' : tipo === 'warning' ? '#FF9800' : '#4CAF50'};
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    
    // Estilo do botão de fechar
    const botaoFechar = nota.querySelector('button');
    botaoFechar.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        margin-left: 10px;
        font-weight: bold;
    `;
    
    document.body.appendChild(nota);
    notificacaoAtual = nota;
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
        if (nota.parentElement) {
            nota.remove();
        }
    }, 5000);
}

// Função para inicializar o mapa
function inicializarMapa() {
    // Criar mapa centrado em Maricá
    mapa = L.map('map').setView([-22.9189, -42.8194], 14);
    
    // Adicionar camada de tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapa);
    
    // Adicionar controle de escala
    L.control.scale().addTo(mapa);
    
    // Adicionar evento de clique no mapa
    mapa.on('click', function(e) {
        handleMapClick(e);
    });
    
    // Carregar pontos de referência
    carregarPontosReferencia();
    
    console.log("🗺️ Mapa inicializado com sucesso!");
}

// Função para lidar com cliques no mapa
function handleMapClick(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    if (!origemCoords) {
        // Definir origem
        definirOrigem(lat, lng);
    } else if (!destinoCoords) {
        // Definir destino
        definirDestino(lat, lng);
        // Calcular rota automaticamente
        calcularRotasTodosModos();
    } else {
        // Se ambos já estão definidos, perguntar se quer redefinir
        if (confirm('Deseja redefinir os pontos e calcular uma nova rota?')) {
            limparRota();
            definirOrigem(lat, lng);
        }
    }
}

// Função para definir origem
function definirOrigem(lat, lng) {
    // Remover marcador anterior
    if (marcadorOrigem) {
        mapa.removeLayer(marcadorOrigem);
    }
    
    // Criar novo marcador
    marcadorOrigem = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'marker-origem',
            html: '<i class="fas fa-map-marker-alt"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(mapa);
    
    // Adicionar popup
    marcadorOrigem.bindPopup('<b>Origem</b><br>Clique para ver opções').openPopup();
    
    // Guardar coordenadas
    origemCoords = { lat: lat, lng: lng };
    
    // Atualizar interface
    document.getElementById('origemStatus').textContent = 'Origem definida';
    
    // Fazer reverse geocoding para obter nome do local
    fetch('/api/buscar_endereco', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query: `${lat}, ${lng}`
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.sucesso && data.resultados.length > 0) {
            origemCoords.nome = data.resultados[0].nome;
            document.getElementById('origemBusca').value = data.resultados[0].nome;
        }
    });
    
    mostrarNota('🟢 Origem definida! Clique no destino.', 'success');
}

// Função para definir destino
function definirDestino(lat, lng) {
    // Remover marcador anterior
    if (marcadorDestino) {
        mapa.removeLayer(marcadorDestino);
    }
    
    // Criar novo marcador
    marcadorDestino = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'marker-destino',
            html: '<i class="fas fa-map-marker-alt"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(mapa);
    
    // Adicionar popup
    marcadorDestino.bindPopup('<b>Destino</b><br>Clique para ver opções').openPopup();
    
    // Guardar coordenadas
    destinoCoords = { lat: lat, lng: lng };
    
    // Atualizar interface
    document.getElementById('destinoStatus').textContent = 'Destino definido';
    
    // Fazer reverse geocoding para obter nome do local
    fetch('/api/buscar_endereco', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query: `${lat}, ${lng}`
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.sucesso && data.resultados.length > 0) {
            destinoCoords.nome = data.resultados[0].nome;
            document.getElementById('destinoBusca').value = data.resultados[0].nome;
        }
    });
    
    mostrarNota('🔴 Destino definido! Calculando rotas...', 'success');
    
    // Calcular rota automaticamente
    calcularRotasTodosModos();
}

// Função para carregar pontos de referência
function carregarPontosReferencia() {
    fetch('/api/pontos_turisticos')
        .then(response => response.json())
        .then(data => {
            if (data.sucesso) {
                pontosReferencia = data.pontos;
                adicionarPontosAoMapa(data.pontos);
            }
        })
        .catch(error => console.error('Erro ao carregar pontos:', error));
}

// Função para adicionar pontos turísticos ao mapa
function adicionarPontosAoMapa(pontos) {
    pontos.forEach(ponto => {
        let iconeClasse = 'fas fa-map-marker-alt';
        let cor = '#2196F3';
        
        switch(ponto.tipo) {
            case 'praia':
                iconeClasse = 'fas fa-umbrella-beach';
                cor = '#00BCD4';
                break;
            case 'lagoa':
                iconeClasse = 'fas fa-water';
                cor = '#4CAF50';
                break;
            case 'centro':
                iconeClasse = 'fas fa-city';
                cor = '#FF9800';
                break;
        }
        
        const marker = L.marker([ponto.lat, ponto.lng], {
            icon: L.divIcon({
                className: 'ponto-turistico',
                html: `<i class="${iconeClasse}" style="color: ${cor}; font-size: 20px;"></i>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(mapa);
        
        marker.bindPopup(`
            <div style="min-width: 200px;">
                <h6><i class="${iconeClasse}"></i> ${ponto.nome}</h6>
                <p>${ponto.descricao}</p>
                <button class="btn btn-sm btn-primary" onclick="selecionarPonto('${ponto.nome}', ${ponto.lat}, ${ponto.lng})">
                    <i class="fas fa-location-arrow"></i> Selecionar
                </button>
            </div>
        `);
    });
}

// Função para selecionar ponto turístico
function selecionarPonto(nome, lat, lng) {
    if (!origemCoords) {
        document.getElementById('origemBusca').value = nome;
        definirOrigem(lat, lng);
    } else if (!destinoCoords) {
        document.getElementById('destinoBusca').value = nome;
        definirDestino(lat, lng);
    } else {
        mostrarNota('Origem e destino já definidos!', 'warning');
    }
}

// Função para calcular rotas para todos os modos de transporte
function calcularRotasTodosModos() {
    if (!origemCoords || !destinoCoords) {
        mostrarNota('⚠️ Por favor, selecione origem e destino!', 'warning');
        return;
    }
    
    document.getElementById('loadingDiv').style.display = 'block';
    
    // Limpar rotas anteriores
    rotasCalculadas = {};
    
    // Calcular rota para o modo selecionado
    calcularRotaSelecionada();
}

// Função para calcular rota para o modo selecionado
function calcularRotaSelecionada() {
    if (!origemCoords || !destinoCoords) return;
    
    fetch('/api/calcular_rota', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            origem_lat: origemCoords.lat,
            origem_lng: origemCoords.lng,
            destino_lat: destinoCoords.lat,
            destino_lng: destinoCoords.lng,
            modo: modoTransporte
        })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('loadingDiv').style.display = 'none';
        
        console.log('Dados recebidos do servidor:', data);
        console.log('Caminho:', data.caminho);
        console.log('Primeiras coordenadas:', data.caminho ? data.caminho.slice(0, 5) : 'Sem caminho');
        
        if (data.sucesso) {
            // Armazenar rota calculada
            rotasCalculadas[modoTransporte] = data;
            exibirRota(data);
            exibirComparacaoRotas();
        } else {
            mostrarNota(`❌ Erro: ${data.mensagem || 'Erro ao calcular rota'}`, 'error');
        }
    })
    .catch(error => {
        document.getElementById('loadingDiv').style.display = 'none';
        console.error('Erro ao calcular rota:', error);
        mostrarNota('❌ Erro ao calcular rota', 'error');
    });
}

// Função para exibir rota no mapa
function exibirRota(dados) {
    console.log('=== exibirRota ===');
    console.log('Formato dos dados:', typeof dados.caminho);
    console.log('Total de coordenadas:', dados.caminho ? dados.caminho.length : 0);
    console.log('Primeiras 3 coordenadas:', dados.caminho ? dados.caminho.slice(0, 3) : 'N/A');
    console.log('Últimas 3 coordenadas:', dados.caminho ? dados.caminho.slice(-3) : 'N/A');
    
    // Verificar se o mapa existe e está inicializado
    console.log('Mapa existe?', typeof mapa !== 'undefined');
    console.log('Mapa inicializado?', mapa !== null);
    
    // Limpar rota anterior
    if (caminhoRota) {
        mapa.removeLayer(caminhoRota);
    }
    
    // Criar nova rota
    console.log('Criando polyline com:', dados.caminho.length, 'coordenadas');
    console.log('Primeira coordenada:', dados.caminho[0]);
    console.log('Última coordenada:', dados.caminho[dados.caminho.length - 1]);
    
    try {
        // Criar polyline com estilo mais visível para debug
        caminhoRota = L.polyline(dados.caminho, {
            color: '#FF0000',  // Vermelho brilhante para debug
            weight: 8,  // Mais espesso para ser visível
            opacity: 1.0,  // Totalmente opaco
            smoothFactor: 1,
            dashArray: '10, 10'  // Tracejado para ser mais visível
        });
        
        console.log('✅ Polyline criado com sucesso!');
        console.log('Adicionando polyline ao mapa...');
        
        // Adicionar ao mapa separadamente para debug
        mapa.addLayer(caminhoRota);
        console.log('✅ Polyline adicionado ao mapa!');
        
        // Testar se o polyline foi realmente adicionado ao mapa
        const bounds = caminhoRota.getBounds();
        console.log('Bounds do polyline:', bounds);
        
        // Se os bounds forem válidos, ajustar o mapa
        if (bounds.isValid()) {
            console.log('Ajustando mapa para mostrar rota...');
            mapa.fitBounds(bounds.pad(0.1));
            console.log('✅ Mapa ajustado!');
        } else {
            console.warn('⚠️ Bounds inválidos!');
        }
        
    } catch (error) {
        console.error('❌ Erro ao criar polyline:', error);
        return;
    }
    
    // Adicionar popup
    caminhoRota.bindPopup(`
        <div style="font-family: Arial, sans-serif;">
            <h6><i class="fas fa-route"></i> Rota Calculada</h6>
            <p><b>Origem:</b> ${origemCoords.nome}</p>
            <p><b>Destino:</b> ${destinoCoords.nome}</p>
            <p><b>Distância:</b> ${(dados.distancia / 1000).toFixed(1)} km</p>
            <p><b>Pontos:</b> ${dados.nos_count}</p>
            <p><b>Algoritmo:</b> Dijkstra</p>
        </div>
    `);
    
    // Ajustar zoom para mostrar toda a rota
    console.log('Ajustando zoom para mostrar rota...');
    console.log('Marcador origem:', marcadorOrigem ? marcadorOrigem.getLatLng() : 'null');
    console.log('Marcador destino:', marcadorDestino ? marcadorDestino.getLatLng() : 'null');
    
    const group = new L.featureGroup([marcadorOrigem, marcadorDestino, caminhoRota]);
    const bounds = group.getBounds();
    console.log('Bounds do grupo:', bounds);
    
    if (bounds.isValid()) {
        mapa.fitBounds(bounds.pad(0.1));
        console.log('✅ Zoom ajustado com sucesso!');
    } else {
        console.warn('⚠️ Bounds inválidos, não ajustando zoom');
    }
    
    // Exibir informações
    exibirInformacoesRota(dados);
    
    console.log(`✅ Rota calculada: ${(dados.distancia / 1000).toFixed(1)} km, ${dados.nos_count} pontos`);
}

// Função para testar rota exemplo
function testarRotaExemplo() {
    console.log('=== Testando rota exemplo ===');
    
    // Definir coordenadas de exemplo em Maricá
    const lat1 = -22.9186;
    const lng1 = -42.8197;
    const lat2 = -22.9200;
    const lng2 = -42.8180;
    
    console.log(`Testando rota: (${lat1}, ${lng1}) -> (${lat2}, ${lng2})`);
    
    // Criar marcadores de teste
    if (marcadorOrigem) mapa.removeLayer(marcadorOrigem);
    if (marcadorDestino) mapa.removeLayer(marcadorDestino);
    
    marcadorOrigem = L.marker([lat1, lng1], {
        draggable: true,
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(mapa);
    
    marcadorDestino = L.marker([lat2, lng2], {
        draggable: true,
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(mapa);
    
    // Definir coordenadas globais
    origemCoords = { lat: lat1, lng: lng1, nome: 'Ponto de Teste A' };
    destinoCoords = { lat: lat2, lng: lng2, nome: 'Ponto de Teste B' };
    
    // Atualizar interface
    document.getElementById('origemStatus').textContent = 'Origem definida (teste)';
    document.getElementById('destinoStatus').textContent = 'Destino definido (teste)';
    
    // Calcular rota
    calcularRotasTodosModos();
}

// Função para exibir comparação de rotas
function exibirComparacaoRotas() {
    const routeCards = document.getElementById('routeCards');
    routeCards.innerHTML = '';
    
    if (Object.keys(rotasCalculadas).length === 0) return;
    
    // Criar cards para cada modo
    const modos = ['driving', 'walking', 'cycling'];
    const titulos = {
        'driving': '🚗 Carro',
        'walking': '🚶‍♂️ Caminhada',
        'cycling': '🚴‍♂️ Bicicleta'
    };
    
    modos.forEach(modo => {
        if (rotasCalculadas[modo]) {
            const rota = rotasCalculadas[modo];
            const distanciaKm = (rota.distancia / 1000).toFixed(1);
            const tempoEstimado = calcularTempoEstimado(distanciaKm, modo);
            
            const card = document.createElement('div');
            card.className = `route-card ${modoTransporte === modo ? 'active' : ''}`;
            card.innerHTML = `
                <div class="route-card-header">
                    <h6>${titulos[modo]}</h6>
                    <span class="route-time">${tempoEstimado}</span>
                </div>
                <div class="route-card-body">
                    <p><i class="fas fa-ruler"></i> ${distanciaKm} km</p>
                    <p><i class="fas fa-route"></i> ${rota.nos_count} pontos</p>
                </div>
            `;
            
            card.addEventListener('click', () => {
                modoTransporte = modo;
                exibirRota(rota);
                atualizarSeletorModo();
                exibirComparacaoRotas();
            });
            
            routeCards.appendChild(card);
        }
    });
}

// Função para calcular tempo estimado
function calcularTempoEstimado(distanciaKm, modo) {
    const velocidades = {
        driving: 30,    // km/h médio em cidade
        walking: 5,     // km/h médio caminhando
        cycling: 15     // km/h médio bicicleta
    };
    
    const velocidade = velocidades[modo] || 30;
    const tempoHoras = distanciaKm / velocidade;
    const tempoMinutos = Math.round(tempoHoras * 60);
    
    if (tempoMinutos < 60) {
        return `${tempoMinutos} min`;
    } else {
        const horas = Math.floor(tempoMinutos / 60);
        const minutos = tempoMinutos % 60;
        return minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
    }
}

// Função para atualizar seletor de modo
function atualizarSeletorModo() {
    // Remover classe active de todos os botões
    document.querySelectorAll('.transport-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Adicionar classe active ao botão selecionado
    const botaoSelecionado = document.querySelector(`[data-mode="${modoTransporte}"]`);
    if (botaoSelecionado) {
        botaoSelecionado.closest('.transport-card').classList.add('active');
    }
}

// Função para exibir informações da rota
function exibirInformacoesRota(dados) {
    const routeInfo = document.getElementById('routeInfo');
    const routeDetails = document.getElementById('routeDetails');
    
    routeDetails.innerHTML = `
        <div class="row">
            <div class="col-6">
                <small><i class="fas fa-map-marker-alt text-success"></i> Origem</small><br>
                <strong>${origemCoords.nome}</strong>
            </div>
            <div class="col-6">
                <small><i class="fas fa-map-marker-alt text-danger"></i> Destino</small><br>
                <strong>${destinoCoords.nome}</strong>
            </div>
        </div>
        <hr>
        <div class="row">
            <div class="col-6">
                <small><i class="fas fa-ruler text-info"></i> Distância</small><br>
                <strong>${(dados.distancia / 1000).toFixed(1)} km</strong>
            </div>
            <div class="col-6">
                <small><i class="fas fa-route text-primary"></i> Pontos</small><br>
                <strong>${dados.nos_count}</strong>
            </div>
        </div>
        <hr>
        <div class="text-center">
            <small class="text-muted">Algoritmo: Dijkstra</small>
        </div>
    `;
    
    routeInfo.style.display = 'block';
}

// Função para limpar rota
function limparRota() {
    // Remover marcadores
    if (marcadorOrigem) {
        mapa.removeLayer(marcadorOrigem);
        marcadorOrigem = null;
    }
    
    if (marcadorDestino) {
        mapa.removeLayer(marcadorDestino);
        marcadorDestino = null;
    }
    
    // Remover rota
    if (caminhoRota) {
        mapa.removeLayer(caminhoRota);
        caminhoRota = null;
    }
    
    // Limpar coordenadas
    origemCoords = null;
    destinoCoords = null;
    
    // Limpar formulários
    document.getElementById('origemBusca').value = '';
    document.getElementById('destinoBusca').value = '';
    
    // Atualizar status
    document.getElementById('origemStatus').textContent = 'Não selecionada';
    document.getElementById('destinoStatus').textContent = 'Não selecionado';
    
    // Esconder informações
    document.getElementById('routeInfo').style.display = 'none';
    document.getElementById('routeCards').innerHTML = '';
    
    // Limpar rotas calculadas
    rotasCalculadas = {};
    
    mostrarNota('🗺️ Mapa limpo! Selecione um novo ponto de origem.', 'info');
}

// Função para buscar endereço
function buscarEndereco(tipo) {
    const input = document.getElementById(tipo + 'Busca');
    const query = input.value.trim();
    
    if (!query) {
        mostrarNota('⚠️ Por favor, digite um endereço!', 'warning');
        return;
    }
    
    document.getElementById('loadingDiv').style.display = 'block';
    
    fetch('/api/buscar_endereco', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('loadingDiv').style.display = 'none';
        
        if (data.sucesso && data.resultados.length > 0) {
            const resultado = data.resultados[0];
            
            if (tipo === 'origem') {
                definirOrigem(resultado.lat, resultado.lng);
                if (resultado.nome) {
                    document.getElementById('origemBusca').value = resultado.nome;
                }
            } else {
                definirDestino(resultado.lat, resultado.lng);
                if (resultado.nome) {
                    document.getElementById('destinoBusca').value = resultado.nome;
                }
            }
            
            // Centralizar mapa no resultado
            mapa.setView([resultado.lat, resultado.lng], 16);
            
        } else {
            mostrarNota('❌ Endereço não encontrado em Maricá', 'error');
        }
    })
    .catch(error => {
        document.getElementById('loadingDiv').style.display = 'none';
        console.error('Erro ao buscar endereço:', error);
        mostrarNota('❌ Erro ao buscar endereço', 'error');
    });
}

// Adicionar animação CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .marker-origem {
        background-color: #4CAF50 !important;
        border: 3px solid white !important;
        border-radius: 50% !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
    }
    
    .marker-destino {
        background-color: #F44336 !important;
        border: 3px solid white !important;
        border-radius: 50% !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
    }
    
    .ponto-turistico {
        background: white;
        border: 2px solid #2196F3;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .ponto-turistico:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    }
    
    .route-card {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .route-card:hover {
        border-color: #2196F3;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .route-card.active {
        border-color: #2196F3;
        background-color: #f0f8ff;
    }
    
    .route-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }
    
    .route-card-header h6 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
    }
    
    .route-time {
        font-size: 12px;
        color: #666;
        font-weight: 500;
    }
    
    .route-card-body {
        font-size: 12px;
        color: #666;
    }
    
    .route-card-body p {
        margin: 2px 0;
    }
`;
document.head.appendChild(style);

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    inicializarMapa();
    
    // Event listeners para Enter nos campos de busca
    document.getElementById('origemBusca').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') buscarEndereco('origem');
    });
    
    document.getElementById('destinoBusca').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') buscarEndereco('destino');
    });
    
    // Configurar seletor de modo de transporte
    document.querySelectorAll('.transport-option').forEach(option => {
        option.addEventListener('click', function() {
            // Remover classe active de todas as opções
            document.querySelectorAll('.transport-option').forEach(opt => opt.classList.remove('active'));
            
            // Adicionar classe active à opção clicada
            this.classList.add('active');
            
            // Obter modo de transporte
            modoTransporte = this.getAttribute('data-mode');
            
            // Se já houver rota calculada para este modo, exibi-la
            if (rotasCalculadas[modoTransporte]) {
                exibirRota(rotasCalculadas[modoTransporte]);
                exibirComparacaoRotas();
            } else if (origemCoords && destinoCoords) {
                // Caso contrário, calcular rota
                calcularRotaSelecionada();
            }
        });
    });
    
    // Selecionar modo padrão (carro)
    document.querySelector('[data-mode="driving"]').classList.add('active');
});

// Função para mostrar informações do algoritmo Dijkstra
function mostrarInfoAlgoritmo() {
    const modalBody = document.getElementById('algoritmoModalBody');
    modalBody.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            <p class="mt-2">Carregando informações do algoritmo...</p>
        </div>
    `;
    
    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('algoritmoModal'));
    modal.show();
    
    // Buscar informações do algoritmo
    fetch('/api/info_algoritmo')
        .then(response => response.json())
        .then(data => {
            if (data.sucesso) {
                const info = data.info;
                modalBody.innerHTML = `
                    <div class="row">
                        <div class="col-md-6">
                            <h6><i class="fas fa-cogs"></i> Algoritmo</h6>
                            <p><strong>${info.algoritmo}</strong></p>
                            <p><strong>Complexidade Temporal:</strong> ${info.complexidade_tempo}</p>
                            <p><strong>Complexidade Espacial:</strong> ${info.complexidade_espaco}</p>
                            <p><strong>Tipo de Grafo:</strong> ${info.tipo_grafo}</p>
                            <p><strong>Aplicação:</strong> ${info.aplicacao}</p>
                        </div>
                        <div class="col-md-6">
                            <h6><i class="fas fa-chart-bar"></i> Estatísticas</h6>
                            <p><strong>Total de Nós:</strong> ${info.total_nos.toLocaleString()}</p>
                            <p><strong>Total de Arestas:</strong> ${info.total_arestas.toLocaleString()}</p>
                            <p><strong>Arestas Randomizadas:</strong> ${info.arestas_randomizadas.toLocaleString()}</p>
                            <p><strong>Randomização Ativa:</strong> ${info.randomizacao_ativa ? '✅ Sim' : '❌ Não'}</p>
                            <p><strong>Idioma:</strong> ${info.idioma}</p>
                        </div>
                    </div>
                    <hr>
                    <h6><i class="fas fa-star"></i> Características</h6>
                    <ul class="list-unstyled">
                        ${info.caracteristicas.map(caracteristica => `<li><i class="fas fa-check text-success"></i> ${caracteristica}</li>`).join('')}
                    </ul>
                    <hr>
                    <div class="alert alert-info">
                        <h6><i class="fas fa-info-circle"></i> Sobre o Algoritmo</h6>
                        <p class="mb-0">
                            O algoritmo de Dijkstra é um algoritmo clássico para encontrar o caminho mais curto 
                            em grafos com arestas ponderadas. Nesta implementação, utilizamos uma fila de prioridade 
                            (heap) para otimizar o desempenho, resultando em complexidade O((V + E) log V).
                        </p>
                    </div>
                    <div class="alert alert-warning">
                        <h6><i class="fas fa-exclamation-triangle"></i> Randomização</h6>
                        <p class="mb-0">
                            Os pesos das arestas foram randomizados em ±20% do valor original para demonstrar 
                            a robustez do algoritmo com diferentes configurações de peso.
                        </p>
                    </div>
                `;
            } else {
                modalBody.innerHTML = `
                    <div class="alert alert-danger">
                        <h6><i class="fas fa-exclamation-triangle"></i> Erro</h6>
                        <p>${data.mensagem || 'Não foi possível carregar as informações do algoritmo.'}</p>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('Erro ao buscar informações do algoritmo:', error);
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    <h6><i class="fas fa-exclamation-triangle"></i> Erro de Conexão</h6>
                    <p>Não foi possível conectar ao servidor para obter as informações.</p>
                </div>
            `;
        });
}