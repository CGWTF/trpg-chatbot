import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .extractor import KnowledgeExtractor
from .graph_analysis import analyze_graph, merge_graph


class KnowledgeGraph(BaseModel):
    entities: list[dict] = Field(default_factory=list)
    relations: list[dict] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    graph: KnowledgeGraph = Field(default_factory=KnowledgeGraph)


app = FastAPI(title="TRPG Knowledge Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(?:localhost|127\.0\.0\.1):\d+",
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)
extractor = KnowledgeExtractor()


@app.get("/health")
def health():
    return {"ok": True, "modelEnabled": extractor.ner is not None}


@app.post("/extract")
def extract(request: ExtractRequest):
    extracted = extractor.extract(request.text)
    graph = merge_graph(request.graph.model_dump(), extracted)
    return {
        "graph": graph,
        "analysis": analyze_graph(graph),
        "extractor": extracted["extractor"],
        "embeddingRecommended": should_recommend_embeddings(graph),
    }


def should_recommend_embeddings(graph: dict) -> bool:
    threshold = int(os.getenv("EMBEDDING_RECOMMENDATION_THRESHOLD", "500"))
    return len(graph.get("entities", [])) + len(graph.get("relations", [])) >= threshold
