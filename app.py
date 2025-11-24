from flask import Flask, render_template, jsonify, request
import osmnx as ox
import networkx as nx
import heapq
import folium
from geopy.geocoders import Nominatim, GoogleV3
from geopy.extra.rate_limiter import RateLimiter
import json
import random
import os
import urllib.request
import urllib.error

# Diretórios de templates e estáticos relativos ao arquivo atual
base_dir = os.path.dirname(os.path.abspath(os.path.realpath(__file__)))
template_dir = os.path.join(base_dir, 'templates')
static_dir = os.path.join(base_dir, 'static')

app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)

# Configurações
cidade_atual = "Maricá, Rio de Janeiro, Brazil"
grafo = None
grafo_proj = None

# Geocoder com configuração otimizada
geolocator = Nominatim(user_agent="marica_routes_app_v2")

# Rate limiter para evitar bloqueios
geocode_com_rate_limit = RateLimiter(geolocator.geocode, min_delay_seconds=0.5)
reverse_geocode_com_rate_limit = RateLimiter(geolocator.reverse, min_delay_seconds=0.5)

def inicializar_sistema():
    """Inicializa o sistema com Maricá"""
    global grafo, grafo_proj
    try:
        print("📍 Carregando dados de Maricá...")
        ox.settings.log_console = False
        # Carregar grafo completo que inclui caminhos pedestres
        grafo = ox.graph_from_place(cidade_atual, network_type='all')
        grafo_proj = ox.project_graph(grafo)
        
        # Aplicar randomização de pesos conforme requisitos do projeto
        randomizar_pesos_grafo(grafo)
        
        print(f"✅ Sucesso! {len(grafo.nodes())} nós, {len(grafo.edges())} arestas")
        return True
    except Exception as e:
        print(f"❌ Erro ao carregar Maricá: {e}")
        return False

def randomizar_pesos_grafo(grafo):
    """Aplica randomização nos pesos das arestas conforme requisitos acadêmicos"""
    print("🔢 Aplicando randomização nos pesos das arestas...")
    
    for origem, destino, chave, dados in grafo.edges(keys=True, data=True):
        # Randomizar o comprimento original (±20% de variação)
        comprimento_original = dados.get('length', 100)
        fator_randomico = random.uniform(0.8, 1.2)
        novo_comprimento = comprimento_original * fator_randomico
        
        # Atualizar os dados da aresta
        grafo[origem][destino][chave]['length'] = novo_comprimento
        grafo[origem][destino][chave]['length_original'] = comprimento_original
        grafo[origem][destino][chave]['fator_randomico'] = fator_randomico

def dijkstra_customizado(grafo, origem_no, destino_no, peso='length'):
    """
    Implementação customizada do algoritmo de Dijkstra com heapq
    Conforme requisitos acadêmicos do projeto
    """
    print(f"🔍 Calculando rota com Dijkstra customizado: {origem_no} → {destino_no}")
    
    # Inicializar distâncias e nós anteriores
    distancias = {no: float('inf') for no in grafo.nodes()}
    anteriores = {no: None for no in grafo.nodes()}
    distancias[origem_no] = 0
    
    # Fila de prioridade (min-heap)
    fila_prioridade = [(0, origem_no)]
    visitados = set()
    
    while fila_prioridade:
        distancia_atual, no_atual = heapq.heappop(fila_prioridade)
        
        if no_atual in visitados:
            continue
            
        visitados.add(no_atual)
        
        # Se chegamos ao destino
        if no_atual == destino_no:
            break
        
        # Explorar vizinhos
        for vizinho in grafo.neighbors(no_atual):
            if vizinho in visitados:
                continue
            
            # Obter dados da aresta
            dados_aresta = grafo.get_edge_data(no_atual, vizinho)
            if not dados_aresta:
                continue
            
            # Usar o primeiro conjunto de dados se houver múltiplas arestas
            info_aresta = list(dados_aresta.values())[0]
            peso_aresta = info_aresta.get(peso, info_aresta.get('length', 1))
            
            distancia = distancia_atual + peso_aresta
            
            if distancia < distancias[vizinho]:
                distancias[vizinho] = distancia
                anteriores[vizinho] = no_atual
                heapq.heappush(fila_prioridade, (distancia, vizinho))
    
    # Reconstruir caminho
    caminho = []
    atual = destino_no
    distancia_total = distancias[destino_no]
    
    if distancia_total == float('inf'):
        return [], 0.0
    
    while atual is not None:
        caminho.append(atual)
        atual = anteriores[atual]
    
    caminho.reverse()
    
    print(f"✅ Rota encontrada: {len(caminho)} nós, {distancia_total:.1f} metros")
    return caminho, distancia_total

def obter_rota_por_geometria(origem_no, destino_no):
    """Obtém rota seguindo exatamente a geometria das vias OSM usando Dijkstra customizado"""
    try:
        # Usar implementação customizada de Dijkstra em vez de nx.shortest_path
        caminho, distancia_total = dijkstra_customizado(grafo, origem_no, destino_no, 'length')
        
        if not caminho:
            return {'sucesso': False, 'erro': 'Não foi possível encontrar caminho'}
        
        # Coletar todas as coordenadas da geometria das arestas
        coordenadas_completas = []
        
        print(f"=== Processando caminho com {len(caminho)} nós ===")
        
        for i in range(len(caminho) - 1):
            no_origem = caminho[i]
            no_destino = caminho[i + 1]
            
            # Obter dados da aresta
            aresta = grafo[no_origem][no_destino][0]
            
            print(f"Processando aresta {no_origem} -> {no_destino}")
            print(f"Tem geometria: {'geometry' in aresta}")
            
            # Se houver geometria, usar as coordenadas exatas
            if 'geometry' in aresta:
                coords = list(aresta['geometry'].coords)
                print(f"Coordenadas da geometria: {len(coords)} pontos")
                print(f"Primeiras coordenadas: {coords[:2] if coords else 'vazio'}")
                
                # Converter de (lng, lat) para (lat, lng) para Leaflet
                coords_convertidas = [(lat, lng) for lng, lat in coords]
                
                # Evitar duplicação de pontos
                if coordenadas_completas and coords_convertidas[0] == coordenadas_completas[-1]:
                    coords_convertidas = coords_convertidas[1:]
                coordenadas_completas.extend(coords_convertidas)
            else:
                # Se não houver geometria, usar coordenadas dos nós
                lat_origem = grafo.nodes[no_origem]['y']
                lng_origem = grafo.nodes[no_origem]['x']
                lat_destino = grafo.nodes[no_destino]['y']
                lng_destino = grafo.nodes[no_destino]['x']
                
                print(f"Usando coordenadas dos nós: ({lat_origem}, {lng_origem}) -> ({lat_destino}, {lng_destino})")
                
                # Coordenadas dos nós já vêm no formato correto (lat, lng) para Leaflet
                # Evitar duplicação de pontos
                if not coordenadas_completas or (lat_origem, lng_origem) != coordenadas_completas[-1]:
                    coordenadas_completas.append((lat_origem, lng_origem))
                coordenadas_completas.append((lat_destino, lng_destino))
            
        # Converter para formato [lat, lng] e garantir coordenadas válidas
        coords_otimizadas = []
        for coord in coordenadas_completas:
            if len(coord) >= 2:
                try:
                    # Determinar formato da coordenada
                    if isinstance(coord[0], tuple):  # Formato (lng, lat)
                        lng, lat = coord[0], coord[1]
                    else:  # Formato [lat, lng] ou (lat, lng)
                        lat, lng = coord[0], coord[1]
                    
                    # Verificar se não é duplicada da anterior
                    if coords_otimizadas:
                        lat_prev, lng_prev = coords_otimizadas[-1]
                        if abs(lat - lat_prev) < 0.000001 and abs(lng - lng_prev) < 0.000001:
                            continue  # Pular coordenada duplicada
                    
                    # Garantir que são floats válidos
                    lat_float = float(lat)
                    lng_float = float(lng)
                    coords_otimizadas.append([lat_float, lng_float])
                    
                except (ValueError, TypeError):
                    continue
        
        print(f"=== Coordenadas finais ===")
        print(f"Total de coordenadas: {len(coords_otimizadas)}")
        print(f"Primeiras 5 coordenadas: {coords_otimizadas[:5] if coords_otimizadas else 'vazio'}")
        print(f"Últimas 5 coordenadas: {coords_otimizadas[-5:] if coords_otimizadas else 'vazio'}")
        
        # Verificar se as coordenadas estão no formato correto para Leaflet [lat, lng]
        if coords_otimizadas:
            print(f"Formato de coordenadas: {type(coords_otimizadas[0])}")
            print(f"Exemplo de coordenada: {coords_otimizadas[0]}")
            if isinstance(coords_otimizadas[0], list) and len(coords_otimizadas[0]) == 2:
                print(f"Latitude: {coords_otimizadas[0][0]}, Longitude: {coords_otimizadas[0][1]}")
        
        return {
            'sucesso': True,
            'caminho': coords_otimizadas,
            'distancia': distancia_total,
            'nos_count': len(caminho)
        }
        
    except Exception as e:
        print(f"Erro ao obter rota por geometria: {e}")
        return {'sucesso': False, 'erro': str(e)}

def calcular_rota_entre_pontos(origem_lat, origem_lng, destino_lat, destino_lng, modo='driving'):
    """Calcula rota entre dois pontos usando Dijkstra"""
    try:
        # Encontrar nós mais próximos das coordenadas (com projeção quando disponível)
        try:
            if grafo_proj is not None:
                from shapely.geometry import Point
                p_origem = Point(origem_lng, origem_lat)
                p_destino = Point(destino_lng, destino_lat)
                p_origem_proj, _ = ox.projection.project_geometry(p_origem, to_crs=grafo_proj.graph.get('crs'))
                p_destino_proj, _ = ox.projection.project_geometry(p_destino, to_crs=grafo_proj.graph.get('crs'))
                origem_no = ox.nearest_nodes(grafo_proj, p_origem_proj.x, p_origem_proj.y)
                destino_no = ox.nearest_nodes(grafo_proj, p_destino_proj.x, p_destino_proj.y)
            else:
                origem_no = ox.nearest_nodes(grafo, origem_lng, origem_lat)
                destino_no = ox.nearest_nodes(grafo, destino_lng, destino_lat)
        except Exception as e:
            return {'sucesso': False, 'erro': f'Erro ao encontrar nos mais proximos: {str(e)}'}

        if origem_no is None or destino_no is None:
            return {'sucesso': False, 'erro': 'Nao foi possivel encontrar nos validos para as coordenadas fornecidas'}

        # Usar a função de geometria para obter rota precisa
        resultado = obter_rota_por_geometria(origem_no, destino_no)
        
        if resultado['sucesso']:
            return {
                'sucesso': True,
                'caminho': resultado['caminho'],
                'distancia': resultado['distancia'],
                'nos_count': resultado['nos_count'],
                'modo': modo
            }
        else:
            return {'sucesso': False, 'erro': resultado.get('erro', 'Erro desconhecido')}
            
    except Exception as e:
        import traceback
        print(f"Erro completo ao calcular rota: {traceback.format_exc()}")
        return {'sucesso': False, 'erro': f'Erro ao calcular rota: {str(e)}'}

@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')

@app.route('/api/buscar_endereco', methods=['POST'])
def api_buscar_endereco():
    """Busca endereços e locais em Maricá"""
    try:
        dados = request.json
        query = dados.get('query', '')
        
        if not query:
            return jsonify({'error': 'Query não fornecida'})
        
        # Tentar identificar coordenadas "lat, lng" e fazer reverse geocoding
        try:
            partes = query.split(',')
            if len(partes) == 2:
                lat = float(partes[0].strip())
                lng = float(partes[1].strip())
                return api_reverse_geocode(lat, lng)
        except (ValueError, AttributeError):
            pass
        
        # Adicionar "Maricá RJ" à busca para melhor precisão
        query_completa = f"{query}, Maricá, Rio de Janeiro, Brazil"
        
        # Fazer geocoding
        location = geocode_com_rate_limit(query_completa)
        
        if location:
            return jsonify({
                'sucesso': True,
                'resultados': [{
                    'nome': location.address,
                    'lat': location.latitude,
                    'lng': location.longitude
                }]
            })
        else:
            return jsonify({
                'sucesso': False,
                'mensagem': 'Endereço não encontrado em Maricá'
            })
            
    except Exception as e:
        return jsonify({
            'sucesso': False,
            'mensagem': f'Erro ao buscar endereço: {str(e)}'
        })

@app.route('/api/reverse_geocode', methods=['POST'])
def api_reverse_geocode_route():
    """Faz reverse geocoding (coordenadas -> endereço)"""
    try:
        dados = request.json
        lat = dados.get('lat')
        lng = dados.get('lng')
        
        if lat is None or lng is None:
            return jsonify({'sucesso': False, 'mensagem': 'Coordenadas não fornecidas'})
        
        return api_reverse_geocode(float(lat), float(lng))
    except Exception as e:
        return jsonify({'sucesso': False, 'mensagem': f'Erro ao fazer reverse geocoding: {str(e)}'})

def api_reverse_geocode(lat, lng):
    """Função auxiliar para reverse geocoding"""
    try:
        location = reverse_geocode_com_rate_limit(f"{lat}, {lng}")
        if location:
            return jsonify({'sucesso': True, 'resultados': [{
                'nome': location.address,
                'lat': location.latitude,
                'lng': location.longitude
            }]})
        else:
            return jsonify({'sucesso': False, 'mensagem': 'Endereço não encontrado para essas coordenadas'})
    except Exception as e:
        return jsonify({'sucesso': False, 'mensagem': f'Erro ao fazer reverse geocoding: {str(e)}'})

@app.route('/api/calcular_rota', methods=['POST'])
def api_calcular_rota():
    """Calcula rota entre dois pontos"""
    try:
        dados = request.json
        origem_lat = dados.get('origem_lat')
        origem_lng = dados.get('origem_lng')
        destino_lat = dados.get('destino_lat')
        destino_lng = dados.get('destino_lng')
        modo = dados.get('modo', 'driving')
        
        if not all([origem_lat, origem_lng, destino_lat, destino_lng]):
            return jsonify({
                'sucesso': False,
                'mensagem': 'Coordenadas incompletas'
            })
        
        # Calcular rota
        resultado = calcular_rota_entre_pontos(
            float(origem_lat), float(origem_lng),
            float(destino_lat), float(destino_lng),
            modo
        )
        
        return jsonify(resultado)
        
    except Exception as e:
        return jsonify({
            'sucesso': False,
            'mensagem': f'Erro ao calcular rota: {str(e)}'
        })

@app.route('/api/info_algoritmo')
def api_info_algoritmo():
    """Retorna informações sobre o algoritmo Dijkstra e estatísticas do grafo"""
    try:
        if grafo is None:
            return jsonify({
                'sucesso': False,
                'mensagem': 'Sistema não inicializado'
            })
        
        # Calcular estatísticas do grafo
        total_nos = len(grafo.nodes())
        total_arestas = len(grafo.edges())
        
        # Verificar quantas arestas têm pesos randomizados
        arestas_randomizadas = 0
        for origem, destino, chave, dados in grafo.edges(keys=True, data=True):
            if 'fator_randomico' in dados:
                arestas_randomizadas += 1
        
        # Informações sobre o algoritmo
        info = {
            'algoritmo': 'Dijkstra Customizado com Heapq',
            'complexidade_tempo': 'O((V + E) log V)',
            'complexidade_espaco': 'O(V)',
            'total_nos': total_nos,
            'total_arestas': total_arestas,
            'arestas_randomizadas': arestas_randomizadas,
            'randomizacao_ativa': arestas_randomizadas > 0,
            'tipo_grafo': 'Direcionado com pesos positivos',
            'aplicacao': 'Rotas urbanas em Maricá, RJ',
            'idioma': 'Português (Brasil)',
            'caracteristicas': [
                'Implementação customizada com heapq',
                'Randomização de pesos (±20%)',
                'Suporte a múltiplos modos de transporte',
                'Visualização com geometria real OSM',
                'Cálculo de tempo estimado por modo'
            ]
        }
        
        return jsonify({
            'sucesso': True,
            'info': info
        })
        
    except Exception as e:
        return jsonify({
            'sucesso': False,
            'mensagem': f'Erro ao obter informações: {str(e)}'
        })

@app.route('/api/pontos_turisticos')
def api_pontos_turisticos():
    """Retorna pontos turísticos de Maricá"""
    try:
        # Pontos turísticos reais de Maricá
        pontos = [
            {
                'nome': 'Praia de Maricá',
                'lat': -22.9189,
                'lng': -42.8194,
                'tipo': 'praia',
                'descricao': 'Principal praia da cidade'
            },
            {
                'nome': 'Lagoa de Maricá',
                'lat': -22.9200,
                'lng': -42.8300,
                'tipo': 'lagoa',
                'descricao': 'Lagoa costeira com águas calmas'
            },
            {
                'nome': 'Centro de Maricá',
                'lat': -22.9180,
                'lng': -42.8190,
                'tipo': 'centro',
                'descricao': 'Centro comercial da cidade'
            },
            {
                'nome': 'Barra de Maricá',
                'lat': -22.9300,
                'lng': -42.8100,
                'tipo': 'praia',
                'descricao': 'Extremidade da praia'
            }
        ]
        
        return jsonify({
            'sucesso': True,
            'pontos': pontos
        })
        
    except Exception as e:
        return jsonify({
            'sucesso': False,
            'mensagem': f'Erro ao buscar pontos turísticos: {str(e)}'
        })

# Configuração OSRM (público por padrão; pode ser sobrescrito via env OSRM_URL)
OSRM_BASE_URL = os.environ.get('OSRM_URL', 'https://router.project-osrm.org')

def chamar_osrm_route(profile, waypoints):
    try:
        if not waypoints or len(waypoints) < 2:
            return {'sucesso': False, 'mensagem': 'Waypoints insuficientes'}
        if len(waypoints) > 7:
            return {'sucesso': False, 'mensagem': 'Limite excedido: máximo origem + 5 paradas + destino'}
        coords = ';'.join([f"{wp[1]},{wp[0]}" for wp in waypoints])
        url = f"{OSRM_BASE_URL}/route/v1/{profile}/{coords}?overview=full&geometries=geojson&steps=false"
        req = urllib.request.Request(url, headers={'User-Agent': 'RotaMarcio/1.0'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        if 'routes' not in data or not data['routes']:
            return {'sucesso': False, 'mensagem': 'OSRM não retornou rotas'}
        r0 = data['routes'][0]
        return {
            'sucesso': True,
            'distance_m': r0.get('distance'),
            'duration_s': r0.get('duration'),
            'geometry_geojson': r0.get('geometry')
        }
    except urllib.error.URLError as e:
        return {'sucesso': False, 'mensagem': f'Erro de rede ao chamar OSRM: {e}'}
    except Exception as e:
        return {'sucesso': False, 'mensagem': f'Erro ao processar resposta OSRM: {str(e)}'}

@app.route('/api/rota_osrm', methods=['POST'])
def api_rota_osrm():
    try:
        dados = request.json or {}
        profile = dados.get('profile', 'driving')
        waypoints = dados.get('waypoints')
        if not isinstance(waypoints, list):
            return jsonify({'sucesso': False, 'mensagem': 'Parâmetro waypoints inválido'})
        wps = []
        for wp in waypoints:
            if not isinstance(wp, (list, tuple)) or len(wp) != 2:
                return jsonify({'sucesso': False, 'mensagem': 'Waypoint inválido'})
            wps.append([float(wp[0]), float(wp[1])])
        resultado = chamar_osrm_route(profile, wps)
        return jsonify(resultado)
    except Exception as e:
        import traceback
        print(f"Erro na API rota_osrm: {traceback.format_exc()}")
        return jsonify({'sucesso': False, 'mensagem': f'Erro ao calcular rota OSRM: {str(e)}'})

@app.route('/api/desvio_parada', methods=['POST'])
def api_desvio_parada():
    try:
        dados = request.json or {}
        profile = dados.get('profile', 'driving')
        base = dados.get('base')
        candidate = dados.get('candidate')
        if not isinstance(base, list) or len(base) < 2:
            return jsonify({'sucesso': False, 'mensagem': 'Rota base inválida'})
        if not isinstance(candidate, (list, tuple)) or len(candidate) != 2:
            return jsonify({'sucesso': False, 'mensagem': 'Candidato inválido'})
        base_norm = [[float(wp[0]), float(wp[1])] for wp in base]
        res_base = chamar_osrm_route(profile, base_norm)
        if not res_base.get('sucesso'):
            return jsonify({'sucesso': False, 'mensagem': res_base.get('mensagem', 'Falha ao calcular base')})
        with_candidate = base_norm[:-1] + [[float(candidate[0]), float(candidate[1])]] + [base_norm[-1]]
        if len(with_candidate) > 7:
            return jsonify({'sucesso': False, 'mensagem': 'Limite excedido ao adicionar parada'})
        res_cand = chamar_osrm_route(profile, with_candidate)
        if not res_cand.get('sucesso'):
            return jsonify({'sucesso': False, 'mensagem': res_cand.get('mensagem', 'Falha ao calcular com parada')})
        delta_dist = (res_cand.get('distance_m') or 0) - (res_base.get('distance_m') or 0)
        delta_dur = (res_cand.get('duration_s') or 0) - (res_base.get('duration_s') or 0)
        return jsonify({
            'sucesso': True,
            'delta_distance_m': delta_dist,
            'delta_duration_s': delta_dur,
            'preview_geometry_geojson': res_cand.get('geometry_geojson')
        })
    except Exception as e:
        import traceback
        print(f"Erro na API desvio_parada: {traceback.format_exc()}")
        return jsonify({'sucesso': False, 'mensagem': f'Erro ao calcular desvio: {str(e)}'})

if __name__ == '__main__':
    if inicializar_sistema():
        print("🚀 Iniciando servidor Flask...")
        app.run(debug=True, host='0.0.0.0', port=5000)
    else:
        print("❌ Não foi possível inicializar o sistema")
