import networkx as nx


def merge_graph(current: dict, extracted: dict) -> dict:
    entities = {entity["id"]: entity for entity in current.get("entities", [])}
    by_name = {entity["name"]: entity["id"] for entity in entities.values()}
    for entity in extracted.get("entities", []):
        entity_id = by_name.get(entity["name"], entity["id"])
        entities[entity_id] = {**entities.get(entity_id, {}), **entity, "id": entity_id}
        by_name[entity["name"]] = entity_id

    relations = {relation["id"]: relation for relation in current.get("relations", [])}
    for relation in extracted.get("relations", []):
        source_id = by_name.get(relation["source"], relation["source"])
        target_id = by_name.get(relation["target"], relation["target"])
        normalized = {**relation, "source": source_id, "target": target_id}
        relations[normalized["id"]] = {**relations.get(normalized["id"], {}), **normalized}
    return {"entities": list(entities.values()), "relations": list(relations.values())}


def analyze_graph(graph: dict) -> dict:
    network = nx.Graph()
    for entity in graph.get("entities", []):
        network.add_node(entity["id"], **entity)
    for relation in graph.get("relations", []):
        if relation["source"] in network and relation["target"] in network:
            network.add_edge(relation["source"], relation["target"], **relation)

    if network.number_of_nodes() == 0:
        return empty_analysis()

    degree = nx.degree_centrality(network)
    betweenness = nx.betweenness_centrality(network)
    components = list(nx.connected_components(network))
    suspicious = []
    for node_id in network.nodes:
        suspicious.append({
            "entityId": node_id,
            "name": network.nodes[node_id].get("name", node_id),
            "degreeCentrality": round(degree.get(node_id, 0), 4),
            "betweennessCentrality": round(betweenness.get(node_id, 0), 4),
            "score": round(degree.get(node_id, 0) * 0.6 + betweenness.get(node_id, 0) * 0.4, 4),
        })
    suspicious.sort(key=lambda item: item["score"], reverse=True)
    return {
        "nodeCount": network.number_of_nodes(),
        "relationCount": network.number_of_edges(),
        "componentCount": len(components),
        "centralEntities": suspicious[:8],
        "isolatedEntityIds": list(nx.isolates(network)),
    }


def empty_analysis() -> dict:
    return {
        "nodeCount": 0,
        "relationCount": 0,
        "componentCount": 0,
        "centralEntities": [],
        "isolatedEntityIds": [],
    }
